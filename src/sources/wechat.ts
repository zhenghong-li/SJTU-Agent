import { broker } from '../browser/broker.js';
import { fetchText, WECHAT_UA } from '../http/public.js';
import { SourceError } from '../core/tool.js';

const SOGOU = 'https://weixin.sogou.com';
const desktopUA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

export interface WechatSearchItem {
  title: string;
  account: string;
  publishTime: string | null;
  summary: string;
  sogouLink: string;
  resolvable: boolean;
}

export interface WechatArticle {
  url: string;
  title: string;
  account: string;
  author: string;
  publishTime: string | null;
  content: string;
  truncated: boolean;
}

const cache = new Map<string, { at: number; value: unknown }>();

function cached<T>(key: string, ttlMs: number): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function remember<T>(key: string, value: T): T {
  if (cache.size > 100) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function decodeText(input: string): string {
  return input
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchArticles(
  query: string,
  page = 1,
): Promise<{ page: number; items: WechatSearchItem[] }> {
  const q = query.trim();
  if (!q) throw new Error('query 不能为空');
  const key = `sogou:${q}:${page}`;
  const hit = cached<{ page: number; items: WechatSearchItem[] }>(key, 5 * 60_000);
  if (hit) return hit;

  const url = `${SOGOU}/weixin?type=2&query=${encodeURIComponent(q)}&ie=utf8&page=${page}`;
  const response = await fetchText(url, {
    headers: {
      'User-Agent': desktopUA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeoutMs: 20_000,
  });
  if (response.status !== 200) {
    throw new SourceError(`搜狗微信搜索返回 HTTP ${response.status}`, {
      code: 'UPSTREAM_DOWN',
      retryable: true,
    });
  }
  const html = response.text;
  if (/请输入验证码|antispider|访问过于频繁/.test(html)) {
    throw new SourceError('搜狗触发反爬验证，请稍后重试或降低频率', {
      code: 'RATE_LIMITED',
      retryable: true,
    });
  }

  const chunks = html.split('id="sogou_vr_11002601_box_').slice(1);
  const items: WechatSearchItem[] = [];
  for (const chunk of chunks) {
    const titleMatch = chunk.match(
      /<h3>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
    );
    if (!titleMatch) continue;
    const href = titleMatch[1].replace(/&amp;/g, '&');
    const summaryMatch = chunk.match(/<p class="txt-info"[^>]*>([\s\S]*?)<\/p>/);
    const accountMatch = chunk.match(
      /class="all-time-y2"[^>]*>([\s\S]*?)<\/span>/,
    );
    const timestampMatch = chunk.match(/timeConvert\('(\d+)'\)/);
    items.push({
      title: decodeText(titleMatch[2]),
      account: accountMatch ? decodeText(accountMatch[1]) : '',
      publishTime: timestampMatch
        ? new Date(Number(timestampMatch[1]) * 1000).toISOString()
        : null,
      summary: summaryMatch ? decodeText(summaryMatch[1]).slice(0, 200) : '',
      sogouLink: href.startsWith('/') ? SOGOU + href : href,
      resolvable: false,
    });
  }
  return remember(key, { page, items });
}

export function isWechatArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'mp.weixin.qq.com' &&
      parsed.pathname.startsWith('/s')
    );
  } catch {
    return false;
  }
}

export async function readArticle(
  url: string,
  maxChars = 8_000,
): Promise<WechatArticle> {
  if (!isWechatArticleUrl(url)) {
    throw new SourceError('只接受 https://mp.weixin.qq.com/s/ 文章直链', {
      code: 'VALIDATION',
    });
  }
  const key = `article:${url}:${maxChars}`;
  const hit = cached<WechatArticle>(key, 24 * 60 * 60_000);
  if (hit) return hit;

  const response = await fetchText(url, {
    userAgent: WECHAT_UA,
    headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    timeoutMs: 20_000,
  });
  if (!response.status || response.status !== 200) {
    throw new SourceError(`微信文章页返回 HTTP ${response.status}`, {
      code: 'UPSTREAM_DOWN',
      retryable: true,
    });
  }
  const html = response.text;
  if (/环境异常|完成验证|去验证/.test(html) && html.length < 200_000) {
    throw new SourceError('微信返回环境验证页，请用浏览器打开文章后重试', {
      code: 'SOURCE_CHANGED',
      hint: '或用 wechat_resolve_url + 浏览器打开后复制直链',
    });
  }

  const title = decodeText(
    html.match(/<span class="js_title_inner">([\s\S]*?)<\/span>/)?.[1] ??
      html.match(/id="activity-name"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ??
      '',
  );
  const account = decodeText(
    html.match(/var nickname\s*=\s*htmlDecode\("([^"]*)"\)/)?.[1] ??
      html.match(/var nickname\s*=\s*["']([^"']*)["']/)?.[1] ??
      html.match(/id="js_name"[^>]*>([\s\S]*?)<\/a>/)?.[1] ??
      '',
  );
  const author = decodeText(
    html.match(/var author\s*=\s*["']([^"']*)["']/)?.[1] ?? '',
  );
  const ctRaw =
    html.match(/var ct\s*=\s*["'](\d+)["']/)?.[1] ??
    html.match(/create_time\s*=\s*["'](\d+)["']/)?.[1];
  let content = '';
  const marker = html.match(/<div[^>]*id="js_content"[^>]*>/);
  if (marker) {
    const start = (marker.index ?? 0) + marker[0].length;
    let depth = 1;
    let end = html.length;
    const re = /<div\b[^>]*>|<\/div>/gi;
    re.lastIndex = start;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) {
      if (match[0].toLowerCase().startsWith('<div')) depth += 1;
      else depth -= 1;
      if (depth === 0) {
        end = match.index;
        break;
      }
    }
    content = decodeText(html.slice(start, end));
  }
  const truncated = content.length > maxChars;
  return remember(key, {
    url,
    title,
    account,
    author,
    publishTime: ctRaw ? new Date(Number(ctRaw) * 1000).toISOString() : null,
    content: truncated ? content.slice(0, maxChars) : content,
    truncated,
  });
}

/**
 * Resolve a Sogou /link redirect by opening it in the real Chrome and waiting
 * for the final mp.weixin.qq.com URL. Slow but closes the search→read loop.
 */
export async function resolveSogouLink(link: string): Promise<string> {
  if (!/^https?:\/\/weixin\.sogou\.com\/link\?/.test(link)) {
    throw new SourceError('只接受 weixin.sogou.com/link? 形式的跳转链接', {
      code: 'VALIDATION',
    });
  }
  const context = await broker.start();
  const page = await context.newPage();
  try {
    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
    const deadline = Date.now() + 15_000;
    let current = page.url();
    while (Date.now() < deadline && !current.includes('mp.weixin.qq.com/s')) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      current = page.url();
    }
    if (!current.includes('mp.weixin.qq.com/s')) {
      throw new SourceError('未能从搜狗跳转到微信文章（可能被反爬拦截）', {
        code: 'SOURCE_CHANGED',
        hint: '可手动在浏览器打开该搜狗链接后复制 mp.weixin.qq.com 直链',
      });
    }
    return current;
  } finally {
    await page.close().catch(() => undefined);
  }
}
