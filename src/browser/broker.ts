import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright-core';
import { loadConfig } from '../core/config.js';

const CHROME_FALLBACK = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export interface BrowserStatus {
  started: boolean;
  profileDir: string;
  port: number;
  pages: number;
}

/**
 * Phase A Browser Broker (prototype).
 * - dedicated Chrome profile under dataDir/chrome-profile
 * - fixed remote-debugging port
 * - lazy start (never on MCP initialize)
 * - single visible context kept alive for login + prefill
 */
export class BrowserBroker {
  private context: BrowserContext | null = null;
  private starting: Promise<BrowserContext> | null = null;

  status(): BrowserStatus {
    const config = loadConfig();
    return {
      started: this.context !== null,
      profileDir: this.profileDir(),
      port: config.browser.port,
      pages: this.context?.pages().length ?? 0,
    };
  }

  profileDir(): string {
    return path.join(loadConfig().dataDir, 'chrome-profile');
  }

  async start(): Promise<BrowserContext> {
    if (this.context) return this.context;
    if (this.starting) return this.starting;

    this.starting = this.launch().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async launch(): Promise<BrowserContext> {
    const config = loadConfig();
    const profileDir = this.profileDir();
    fs.mkdirSync(profileDir, { recursive: true });

    const launch = async () => {
      const { chromium } = await import('playwright-core');
      return chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        headless: false,
        viewport: null,
        acceptDownloads: true,
        args: [
          '--no-first-run',
          '--no-default-browser-check',
          `--remote-debugging-port=${config.browser.port}`,
        ],
      });
    };

    try {
      this.context = await launch();
    } catch (error) {
      // A stale profile lock (previous crash) is the common failure. Clear the
      // Singleton* files once and retry before surfacing the error.
      this.clearStaleSingletonLock(profileDir);
      try {
        this.context = await launch();
      } catch {
        throw error;
      }
    }

    this.context.on('close', () => {
      this.context = null;
    });
    return this.context;
  }

  private clearStaleSingletonLock(profileDir: string): void {
    for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
      try {
        fs.rmSync(path.join(profileDir, name), { force: true });
      } catch {
        // best effort
      }
    }
  }

  /**
   * Open a visible page and start navigation without waiting for it.
   * Returns as soon as the page object exists so an MCP tool call is
   * non-blocking (DSH tool calls have a timeout; human login takes minutes).
   */
  async openPage(url: string, timeoutMs = 20_000): Promise<Page> {
    const context = await this.start();
    const page = await context.newPage();
    await page.bringToFront().catch(() => undefined);
    void page
      .goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      .catch(() => undefined);
    return page;
  }

  async cookies(): Promise<Awaited<ReturnType<BrowserContext['cookies']>>> {
    if (!this.context) return [];
    return this.context.cookies();
  }

  async clearCookies(): Promise<void> {
    if (!this.context) return;
    await this.context.clearCookies();
  }

  async close(): Promise<void> {
    if (!this.context) return;
    await this.context.close().catch(() => undefined);
    this.context = null;
  }
}

export const broker = new BrowserBroker();
