import { broker } from '../browser/broker.js';

export interface BrowserFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Open this URL once in the real browser first (SSO warm-up). */
  warmupUrl?: string;
  acceptJson?: boolean;
}

export interface BrowserTextResponse {
  status: number;
  url: string;
  text: string;
}

const warmed = new Set<string>();

export async function warmUp(url: string): Promise<void> {
  if (warmed.has(url)) return;
  const context = await broker.start();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    warmed.add(url);
  } catch {
    // best effort: the following request decides the result
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function browserFetch(
  url: string,
  options: BrowserFetchOptions = {},
): Promise<BrowserTextResponse> {
  const context = await broker.start();
  if (options.warmupUrl) await warmUp(options.warmupUrl);
  const response = await context.request.get(url, {
    timeout: options.timeoutMs ?? 20_000,
    failOnStatusCode: false,
    headers: {
      Accept: options.acceptJson
        ? 'application/json, text/plain, */*'
        : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      ...options.headers,
    },
  });
  return {
    status: response.status(),
    url: response.url(),
    text: await response.text().catch(() => ''),
  };
}

export async function browserJson<T>(
  url: string,
  options: BrowserFetchOptions = {},
): Promise<{ status: number; url: string; json: T }> {
  const response = await browserFetch(url, { ...options, acceptJson: true });
  let json: T;
  try {
    json = JSON.parse(response.text) as T;
  } catch {
    throw new Error(`expected JSON but got: ${response.text.slice(0, 120)}`);
  }
  return { status: response.status, url: response.url, json };
}

export async function browserPostForm(
  url: string,
  form: Record<string, string>,
  options: BrowserFetchOptions = {},
): Promise<BrowserTextResponse> {
  const context = await broker.start();
  if (options.warmupUrl) await warmUp(options.warmupUrl);
  const response = await context.request.post(url, {
    form,
    timeout: options.timeoutMs ?? 20_000,
    failOnStatusCode: false,
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      ...options.headers,
    },
  });
  return {
    status: response.status(),
    url: response.url(),
    text: await response.text().catch(() => ''),
  };
}
