import { browserFetch, browserJson } from '../http/browser.js';
import { SourceError } from '../core/tool.js';

const BASE = 'https://shuiyuan.sjtu.edu.cn';
const MIN_INTERVAL_MS = 2_500;

export interface WaterTopicSummary {
  id: number;
  title: string;
  url: string;
  postsCount: number | null;
  replyCount: number | null;
  views: number | null;
  likeCount: number | null;
  createdAt: string | null;
  lastPostedAt: string | null;
  categoryId: number | null;
  tags: string[];
}

interface DiscourseTopic {
  id: number;
  title?: string;
  fancy_title?: string;
  slug?: string;
  posts_count?: number;
  reply_count?: number;
  views?: number;
  like_count?: number;
  created_at?: string;
  last_posted_at?: string;
  category_id?: number;
  tags?: Array<string | { name?: string; slug?: string }>;
}

interface SearchResponse {
  topics?: DiscourseTopic[];
}

interface TopResponse {
  topic_list?: { topics?: DiscourseTopic[] };
}

interface CategoryListResponse {
  category_list?: {
    categories?: Array<{ id: number; name: string; slug: string; parent_category_id?: number | null }>;
  };
}

interface TopicDetailResponse extends DiscourseTopic {
  post_stream?: {
    posts?: Array<{
      post_number?: number;
      username?: string;
      created_at?: string;
      like_count?: number;
      cooked?: string;
    }>;
  };
}

const cache = new Map<string, { at: number; value: unknown }>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run as Promise<T>;
}

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

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function topicUrl(topic: DiscourseTopic): string {
  const slug = topic.slug?.trim();
  return slug ? `${BASE}/t/${slug}/${topic.id}` : `${BASE}/t/${topic.id}`;
}

function summarize(topic: DiscourseTopic): WaterTopicSummary {
  return {
    id: topic.id,
    title: stripHtml(topic.fancy_title ?? topic.title ?? ''),
    url: topicUrl(topic),
    postsCount: topic.posts_count ?? null,
    replyCount: topic.reply_count ?? null,
    views: topic.views ?? null,
    likeCount: topic.like_count ?? null,
    createdAt: topic.created_at ?? null,
    lastPostedAt: topic.last_posted_at ?? null,
    categoryId: topic.category_id ?? null,
    tags: Array.isArray(topic.tags)
      ? topic.tags
          .map((tag) => (typeof tag === 'string' ? tag : (tag.name ?? tag.slug ?? '')))
          .filter(Boolean)
      : [],
  };
}

async function requestJson<T>(
  path: string,
  warmupUrl = BASE + '/',
): Promise<T> {
  const response = await browserJson<T>(BASE + path, { warmupUrl });
  if (response.status === 403 || response.status === 401) {
    throw new SourceError('水源需要登录（SSO 会话未建立或已过期）', {
      code: 'AUTH_REQUIRED',
      userAction: '先在浏览器打开 https://shuiyuan.sjtu.edu.cn/ 完成 SSO，再调用 auth_probe 确认',
    });
  }
  if (response.status === 429) {
    throw new SourceError('水源限流（429），请稍后重试', {
      code: 'RATE_LIMITED',
      retryable: true,
    });
  }
  if (response.status !== 200) {
    throw new SourceError(`水源接口返回 HTTP ${response.status}`, {
      code: 'UPSTREAM_DOWN',
      retryable: true,
    });
  }
  return response.json;
}

export async function searchTopics(
  query: string,
  page = 1,
  limit = 15,
): Promise<{ page: number; total: number; items: WaterTopicSummary[] }> {
  const q = query.trim();
  if (!q) throw new Error('query 不能为空');
  const key = `search:${q}:${page}`;
  const hit = cached<{ page: number; total: number; items: WaterTopicSummary[] }>(
    key,
    5 * 60_000,
  );
  if (hit) return { ...hit, items: hit.items.slice(0, limit) };
  const payload = await schedule(() =>
    requestJson<SearchResponse>(
      `/search.json?q=${encodeURIComponent(q)}&page=${page}`,
    ),
  );
  const all = (payload.topics ?? []).map(summarize);
  const value = {
    page,
    total: all.length,
    items: all,
  };
  remember(key, value);
  return { ...value, items: all.slice(0, limit) };
}

async function findCategory(
  category: string,
): Promise<{ id: number; slug: string; name: string } | null> {
  const payload = await schedule(() =>
    requestJson<CategoryListResponse>('/categories.json'),
  );
  const list = payload.category_list?.categories ?? [];
  const needle = category.trim().toLowerCase();
  const match = list.find(
    (item) =>
      item.slug.toLowerCase() === needle ||
      item.name.toLowerCase() === needle ||
      String(item.id) === needle,
  );
  return match ? { id: match.id, slug: match.slug, name: match.name } : null;
}

export async function hotTopics(options: {
  period?: string;
  category?: string;
  limit?: number;
}): Promise<{
  period: string;
  category: string | null;
  items: WaterTopicSummary[];
}> {
  const period = options.period ?? 'weekly';
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const category = options.category?.trim();
  const key = `hot:${period}:${category ?? ''}:${limit}`;
  const hit = cached<{
    period: string;
    category: string | null;
    items: WaterTopicSummary[];
  }>(key, 30 * 60_000);
  if (hit) return hit;

  if (category) {
    const found = await findCategory(category);
    if (!found) {
      throw new SourceError(`找不到水源板块：${category}`, {
        code: 'NOT_FOUND',
        hint: '可先不指定 category，或用热门板块名/ slug',
      });
    }
    const payload = await schedule(() =>
      requestJson<TopResponse>(
        `/c/${found.slug}/${found.id}/l/top.json?period=${encodeURIComponent(period)}`,
      ),
    );
    return remember(key, {
      period,
      category: found.name,
      items: (payload.topic_list?.topics ?? []).slice(0, limit).map(summarize),
    });
  }

  const payload = await schedule(() =>
    requestJson<TopResponse>(
      `/top.json?period=${encodeURIComponent(period)}`,
    ),
  );
  return remember(key, {
    period,
    category: null,
    items: (payload.topic_list?.topics ?? []).slice(0, limit).map(summarize),
  });
}

export async function topicDetail(
  idOrUrl: string | number,
  includeReplies = false,
): Promise<{
  topic: WaterTopicSummary & {
    postsCount: number | null;
    replyCount: number | null;
    tags: string[];
    createdAt: string | null;
    categoryId: number | null;
  };
  replies?: Array<{
    postNumber: number | null;
    username: string | null;
    createdAt: string | null;
    likeCount: number | null;
    text: string;
  }>;
}> {
  const raw = String(idOrUrl);
  const match = raw.match(/\/t\/(?:[^/]+\/)?(\d+)/) ?? raw.match(/^(\d+)$/);
  if (!match) throw new Error('无法从参数解析水源 topic id');
  const id = Number(match[1]);
  const key = `topic:${id}:${includeReplies ? 'full' : 'brief'}`;
  const hit = cached<ReturnType<typeof topicDetail>>(key, 10 * 60_000);
  if (hit) return hit;

  const payload = await schedule(() =>
    requestJson<TopicDetailResponse>(`/t/${id}.json`),
  );
  const summary = summarize(payload);
  const result: Awaited<ReturnType<typeof topicDetail>> = {
    topic: {
      ...summary,
      postsCount: payload.posts_count ?? null,
      replyCount: payload.reply_count ?? null,
      tags: Array.isArray(payload.tags)
        ? payload.tags
            .map((tag) => (typeof tag === 'string' ? tag : (tag.name ?? tag.slug ?? '')))
            .filter(Boolean)
        : [],
      createdAt: payload.created_at ?? null,
      categoryId: payload.category_id ?? null,
    },
  };
  if (includeReplies) {
    result.replies = (payload.post_stream?.posts ?? []).slice(0, 30).map((post) => ({
      postNumber: post.post_number ?? null,
      username: post.username ?? null,
      createdAt: post.created_at ?? null,
      likeCount: post.like_count ?? null,
      text: stripHtml(post.cooked ?? '').slice(0, 4_000),
    }));
  }
  return remember(key, result);
}
