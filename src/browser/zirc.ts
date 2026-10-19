import type { Frame, Page } from 'playwright-core';
import { broker } from './broker.js';
import { SourceError } from '../core/tool.js';

const HOME = 'https://zirc.sjtu.edu.cn/';
const FRAME_NAME = 'iframe_crmeb_main';

export interface ZircShell {
  page: Page;
  frame: Frame;
}

/** Reuse (or create) the ZIRC shell page and locate its content iframe. */
export async function ensureShell(): Promise<ZircShell> {
  const context = await broker.start();
  let page = context.pages().find((candidate) => candidate.url().startsWith(HOME));
  if (!page) {
    page = await context.newPage();
    await page
      .goto(HOME, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      .catch(() => undefined);
    await page.waitForTimeout(3000);
  }
  const frame = page.frame({ name: FRAME_NAME });
  if (!frame) {
    throw new SourceError('ZIRC 系统框架未加载（iframe_crmeb_main 不存在）', {
      code: 'SOURCE_CHANGED',
      hint: '可能未登录或页面改版；先在浏览器打开 zirc.sjtu.edu.cn 检查',
    });
  }
  return { page, frame };
}

/** Load an inner ZIRC page into the system iframe (the page refuses top-level display). */
export async function openInner(path: string): Promise<ZircShell> {
  const shell = await ensureShell();
  const url = new URL(path, HOME).href;
  await shell.frame
    .goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    .catch(() => undefined);
  await shell.page.waitForTimeout(2000);
  return shell;
}
