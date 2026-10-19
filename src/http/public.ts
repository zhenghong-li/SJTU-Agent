const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

export const WECHAT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44(0x18002c2b) NetType/WIFI Language/zh_CN';

export interface HttpTextResponse {
  status: number;
  url: string;
  text: string;
}

export interface HttpOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  userAgent?: string;
}

export async function fetchText(
  url: string,
  options: HttpOptions = {},
): Promise<HttpTextResponse> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': options.userAgent ?? DESKTOP_UA,
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...options.headers,
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
  });
  return {
    status: response.status,
    url: response.url,
    text: await response.text(),
  };
}

export async function fetchJson<T>(
  url: string,
  options: HttpOptions = {},
): Promise<{ status: number; url: string; json: T }> {
  const response = await fetchText(url, {
    ...options,
    headers: { Accept: 'application/json, text/plain, */*', ...options.headers },
  });
  let json: T;
  try {
    json = JSON.parse(response.text) as T;
  } catch {
    throw new Error(`expected JSON but got: ${response.text.slice(0, 120)}`);
  }
  return { status: response.status, url: response.url, json };
}
