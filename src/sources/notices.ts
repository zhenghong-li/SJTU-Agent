import { fetchText } from '../http/public.js';
import { SourceError } from '../core/tool.js';
import { stripHtml } from './shuiyuan.js';

export interface NoticeSource {
  id: string;
  name: string;
  category: string;
  listUrl: string;
  parser: 'jwc' | 'news' | 'affairs' | 'college';
  auth: 'none' | 'jaccount';
}

export interface NoticeItem {
  id: string;
  sourceId: string;
  sourceName: string;
  category: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
}

interface Parsed {
  href: string;
  title: string;
  summary: string;
  date: Date | null;
}

const SOURCES: NoticeSource[] = [
  {
    id: 'jwc',
    name: '教务处通知',
    category: '教务',
    listUrl: 'https://jwc.sjtu.edu.cn/xwtg/tztg.htm',
    parser: 'jwc',
    auth: 'none',
  },
  {
    id: 'news_jdyw',
    name: '交大要闻',
    category: '新闻',
    listUrl: 'https://news.sjtu.edu.cn/jdyw/index.html',
    parser: 'news',
    auth: 'none',
  },
  {
    id: 'news_mtjj',
    name: '媒体聚焦',
    category: '新闻',
    listUrl: 'https://news.sjtu.edu.cn/mtjj/index.html',
    parser: 'news',
    auth: 'none',
  },
  {
    id: 'news_tsfx',
    name: '探索发现',
    category: '新闻',
    listUrl: 'https://news.sjtu.edu.cn/tsfx/index.html',
    parser: 'news',
    auth: 'none',
  },
  {
    id: 'news_zhxw',
    name: '综合新闻',
    category: '新闻',
    listUrl: 'https://news.sjtu.edu.cn/zhxw/index.html',
    parser: 'news',
    auth: 'none',
  },
  {
    id: 'news_hlxy',
    name: '活力校园',
    category: '新闻',
    listUrl: 'https://news.sjtu.edu.cn/hlxy/index.html',
    parser: 'news',
    auth: 'none',
  },
  {
    id: 'affairs_notice',
    name: '学工通知公告',
    category: '学工',
    listUrl: 'https://affairs.sjtu.edu.cn/index.php?m=app&mid=26&v=information',
    parser: 'affairs',
    auth: 'none',
  },
  {
    id: 'affairs_news',
    name: '学工新闻动态',
    category: '学工',
    listUrl: 'https://affairs.sjtu.edu.cn/index.php?m=app&mid=27&v=news',
    parser: 'affairs',
    auth: 'none',
  },
  {
    id: 'naoce_gjh',
    name: '船建学院·通知公告',
    category: '学院',
    listUrl: 'https://naoce.sjtu.edu.cn/gjh_tzgg.html',
    parser: 'college',
    auth: 'none',
  },
];

const cache = new Map<string, { at: number; value: unknown }>();
const TTL_MS = 30 * 60_000;

function cached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function remember<T>(key: string, value: T): T {
  if (cache.size > 60) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function toDate(year: string, month: string, day: string, hour = 0): Date | null {
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    hour,
    0,
    0,
  );
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseJwc(html: string, baseUrl: string): Parsed[] {
  const items = [...html.matchAll(/<li[^>]*id="line_[^"]*"[\s\S]*?<\/li>/g)];
  const parsed: Parsed[] = [];
  for (const item of items) {
    const text = item[0];
    const href = text.match(/<div class="wz">\s*<a href="([^"]+)"/)?.[1];
    const title = text.match(/<a[^>]*>\s*<h2>([\s\S]*?)<\/h2>/)?.[1];
    const day = text.match(/<div class="sj">\s*<h2>(\d+)<\/h2>\s*<p>(\d{4})\.(\d{1,2})<\/p>/);
    const summary = text.match(/<div class="wz">[\s\S]*?<p>([\s\S]*?)<\/p>/)?.[1];
    if (!href || !title || !day) continue;
    parsed.push({
      href: new URL(href, baseUrl).href,
      title: stripHtml(title),
      summary: summary ? stripHtml(summary).slice(0, 300) : '',
      date: toDate(day[2], day[3], day[1]),
    });
  }
  return parsed;
}

function parseNews(html: string, baseUrl: string): Parsed[] {
  const parsed: Parsed[] = [];
  const items = [
    ...html.matchAll(
      /<li[^>]*>\s*<a href="([^"]+)"[^>]*class="(?:card|item)"[^>]*>([\s\S]*?)<\/li>/g,
    ),
  ];
  for (const item of items) {
    const href = item[1];
    const body = item[2];
    const title = body.match(/<p class="dot">([\s\S]*?)<\/p>/)?.[1];
    const summary = body.match(/<div class="des dot">([\s\S]*?)<\/div>/)?.[1];
    const dateRaw = body.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (!href || !title) continue;
    parsed.push({
      href: new URL(href, baseUrl).href,
      title: stripHtml(title),
      summary: summary ? stripHtml(summary).slice(0, 300) : '',
      date: dateRaw ? toDate(dateRaw[1], dateRaw[2], dateRaw[3]) : null,
    });
  }
  return parsed;
}

function parseAffairs(html: string, baseUrl: string): Parsed[] {
  const items = [...html.matchAll(/<li class="col-xs-12[\s\S]*?<\/li>/g)];
  const parsed: Parsed[] = [];
  for (const item of items) {
    const body = item[0];
    const href = body.match(/<h4><a href="([^"]+)"/)?.[1];
    const title = body.match(/<h4><a[^>]*>([\s\S]*?)<\/a>/)?.[1];
    const day = body.match(/<div class="newdata">\s*<span>(\d{1,2})\/(\d{1,2})<\/span>\s*<p>(\d{4})<\/p>/);
    const summary = body.match(/<\/h4>\s*<p>([\s\S]*?)<a href="[^"]*">详细/)?.[1];
    if (!href || !title) continue;
    parsed.push({
      href: new URL(href, baseUrl).href,
      title: stripHtml(title),
      summary: summary ? stripHtml(summary).slice(0, 300) : '',
      date: day ? toDate(day[3], day[1], day[2]) : null,
    });
  }
  return parsed;
}

/**
 * College sites built on the same template (e.g. naoce.sjtu.edu.cn):
 *   <ul class="dj_lb1"><li><a href="...">title</a><span class="sj">YYYY-MM-DD</span></li>...</ul>
 */
function parseCollegeList(html: string, baseUrl: string): Parsed[] {
  const list = html.match(/<ul class="dj_lb1">([\s\S]*?)<\/ul>/)?.[1] ?? '';
  const items = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)];
  const parsed: Parsed[] = [];
  for (const item of items) {
    const body = item[1];
    const href = body.match(/<a[^>]+href="([^"]+)"/)?.[1];
    const title = body.match(/<a[^>]*>([\s\S]*?)<\/a>/)?.[1];
    const dateRaw = body.match(/<span class="sj">\s*(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!href || !title) continue;
    parsed.push({
      href: new URL(href, baseUrl).href,
      title: stripHtml(title),
      summary: '',
      date: dateRaw ? toDate(dateRaw[1], dateRaw[2], dateRaw[3]) : null,
    });
  }
  return parsed;
}

async function loadSource(source: NoticeSource): Promise<NoticeItem[]> {
  const key = `source:${source.id}`;
  const hit = cached<NoticeItem[]>(key);
  if (hit) return hit;
  const response = await fetchText(source.listUrl, { timeoutMs: 20_000 });
  if (response.status !== 200) {
    throw new SourceError(`${source.name} 返回 HTTP ${response.status}`, {
      code: 'UPSTREAM_DOWN',
      retryable: true,
    });
  }
  let parsed: Parsed[];
  if (source.parser === 'jwc') parsed = parseJwc(response.text, source.listUrl);
  else if (source.parser === 'news') parsed = parseNews(response.text, source.listUrl);
  else if (source.parser === 'college') parsed = parseCollegeList(response.text, source.listUrl);
  else parsed = parseAffairs(response.text, source.listUrl);

  const items = parsed.map((item, index) => ({
    id: `${source.id}:${index}:${item.href}`,
    sourceId: source.id,
    sourceName: source.name,
    category: source.category,
    title: item.title,
    url: item.href,
    summary: item.summary,
    publishedAt: item.date ? item.date.toISOString() : null,
  }));
  if (items.length === 0) {
    throw new SourceError(`${source.name} 解析到 0 条（页面结构可能已变化）`, {
      code: 'SOURCE_CHANGED',
      hint: '用 CDP/浏览器检查列表页 DOM',
    });
  }
  return remember(key, items);
}

export function listSources(): Array<Omit<NoticeSource, 'parser'>> {
  return SOURCES.map(({ parser: _parser, ...rest }) => rest);
}

export async function listNotices(options: {
  sources?: string[];
  category?: string;
  keyword?: string;
  since?: string;
  limit?: number;
}): Promise<{ items: NoticeItem[]; warnings: string[] }> {
  const wanted = new Set(options.sources?.length ? options.sources : SOURCES.map((s) => s.id));
  const keyword = options.keyword?.trim().toLowerCase();
  const since = options.since ? new Date(options.since) : null;
  const limit = Math.min(60, Math.max(1, options.limit ?? 20));
  const warnings: string[] = [];
  const items: NoticeItem[] = [];

  for (const source of SOURCES) {
    if (!wanted.has(source.id)) continue;
    if (options.category && source.category !== options.category) continue;
    try {
      const sourceItems = await loadSource(source);
      items.push(...sourceItems);
    } catch (error) {
      warnings.push(
        `${source.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const filtered = items
    .filter((item) => (since ? item.publishedAt && new Date(item.publishedAt) >= since : true))
    .filter((item) =>
      keyword
        ? `${item.title} ${item.summary}`.toLowerCase().includes(keyword)
        : true,
    )
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, limit);

  return { items: filtered, warnings };
}

const ALLOWED_DOMAINS = [
  'jwc.sjtu.edu.cn',
  'news.sjtu.edu.cn',
  'affairs.sjtu.edu.cn',
  'naoce.sjtu.edu.cn',
];

export async function getNotice(url: string): Promise<{
  url: string;
  title: string;
  publishedAt: string | null;
  content: string;
  truncated: boolean;
}> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new SourceError('url 不合法', { code: 'VALIDATION' });
  }
  if (!ALLOWED_DOMAINS.some((domain) => parsedUrl.hostname === domain)) {
    throw new SourceError('仅支持已接入通知源的文章链接', {
      code: 'POLICY_BLOCKED',
      hint: `允许域名：${ALLOWED_DOMAINS.join(', ')}`,
    });
  }

  const response = await fetchText(parsedUrl.href, { timeoutMs: 20_000 });
  if (response.status !== 200) {
    throw new SourceError(`文章页返回 HTTP ${response.status}`, {
      code: 'UPSTREAM_DOWN',
      retryable: true,
    });
  }
  const html = response.text;
  const title =
    stripHtml(
      html.match(/<meta[^>]*name="ArticleTitle"[^>]*content="([^"]*)"/i)?.[1] ??
        html.match(/<h2[^>]*class="[^"]*ny_bt[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ??
        html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ??
        html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ??
        html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ??
        '',
    ) || '(无标题)';
  const contentMarker = html.match(
    /<div[^>]*(?:id|class)="[^"]*(?:vsb_content|v_news_content|Article_content|artview_content|article-content|ab_nr)[^"]*"[^>]*>/i,
  );
  const contentHtml =
    contentMarker?.index != null
      ? html.slice(contentMarker.index + contentMarker[0].length, contentMarker.index + contentMarker[0].length + 120_000)
      : html;
  const content = stripHtml(contentHtml);
  const truncated = content.length > 12_000;
  const publishRaw =
    html.match(/<meta[^>]*name="PubDate"[^>]*content="([^"]*)"/i)?.[1] ??
    html.match(/<meta[^>]*name="pubDate"[^>]*content="([^"]*)"/i)?.[1] ??
    html.match(/(\d{4})[年-](\d{1,2})[月-](\d{1,2})/)?.[0] ??
    null;
  return {
    url: parsedUrl.href,
    title,
    publishedAt: publishRaw
      ? publishRaw.replace(/[年月]/g, '-').replace(/日/g, '')
      : null,
    content: truncated ? content.slice(0, 12_000) : content,
    truncated,
  };
}
