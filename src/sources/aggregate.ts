import { searchTopics } from './shuiyuan.js';
import { searchArticles } from './wechat.js';
import { listNotices } from './notices.js';
import { listActivities } from './activity.js';

export interface AggregateItem {
  source: 'shuiyuan' | 'wechat' | 'notice' | 'activity';
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
  extra: Record<string, unknown>;
}

export async function searchAll(
  query: string,
  perSource = 5,
): Promise<{ items: AggregateItem[]; warnings: string[] }> {
  const q = query.trim();
  if (!q) throw new Error('query 不能为空');
  const limit = Math.min(20, Math.max(1, perSource));
  const warnings: string[] = [];

  const results = await Promise.allSettled([
    searchTopics(q, 1, limit),
    searchArticles(q, 1),
    listNotices({ keyword: q, limit }),
    listActivities({ perPage: Math.min(50, limit * 4) }),
  ]);

  const items: AggregateItem[] = [];
  const [water, wechat, notices, activities] = results;

  if (water.status === 'fulfilled') {
    items.push(
      ...water.value.items.map((item) => ({
        source: 'shuiyuan' as const,
        title: item.title,
        url: item.url,
        summary: '',
        publishedAt: item.createdAt,
        extra: {
          id: item.id,
          replyCount: item.replyCount,
          views: item.views,
          likeCount: item.likeCount,
          tags: item.tags,
        },
      })),
    );
  } else {
    warnings.push(`水源: ${water.reason instanceof Error ? water.reason.message : String(water.reason)}`);
  }

  if (wechat.status === 'fulfilled') {
    items.push(
      ...wechat.value.items.slice(0, limit).map((item) => ({
        source: 'wechat' as const,
        title: item.title,
        url: item.sogouLink,
        summary: item.summary,
        publishedAt: item.publishTime,
        extra: { account: item.account },
      })),
    );
  } else {
    warnings.push(`公众号: ${wechat.reason instanceof Error ? wechat.reason.message : String(wechat.reason)}`);
  }

  if (notices.status === 'fulfilled') {
    items.push(
      ...notices.value.items.map((item) => ({
        source: 'notice' as const,
        title: item.title,
        url: item.url,
        summary: item.summary,
        publishedAt: item.publishedAt,
        extra: { sourceName: item.sourceName, category: item.category },
      })),
    );
    warnings.push(...notices.value.warnings);
  } else {
    warnings.push(`通知: ${notices.reason instanceof Error ? notices.reason.message : String(notices.reason)}`);
  }

  if (activities.status === 'fulfilled') {
    const keyword = q.toLowerCase();
    items.push(
      ...activities.value.items
        .filter((item) => item.name.toLowerCase().includes(keyword))
        .slice(0, limit)
        .map((item) => ({
          source: 'activity' as const,
          title: item.name,
          url: item.url,
          summary: item.introduction.slice(0, 200),
          publishedAt: item.startTime,
          extra: { sponsor: item.sponsor },
        })),
    );
  } else {
    warnings.push(`活动: ${activities.reason instanceof Error ? activities.reason.message : String(activities.reason)}`);
  }

  const seen = new Set<string>();
  const deduped = items.filter((item) => {
    const key = `${item.source}:${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { items: deduped, warnings };
}
