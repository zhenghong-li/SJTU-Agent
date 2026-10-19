import { browserJson } from '../http/browser.js';
import { SourceError } from '../core/tool.js';

const MY = 'https://my.sjtu.edu.cn';

export interface ServiceItem {
  id: string;
  name: string;
  department: string;
  code: string;
  uri: string;
  recommend: boolean;
}

export interface Profile {
  name: string;
  account: string;
  studentId: string;
  userType: string;
  organize: string;
  classNo: string;
  major: string | null;
}

interface AccountEntity {
  id?: string;
  account?: string;
  name?: string;
  code?: string;
  userType?: string;
  organize?: { name?: string; id?: string };
  classNo?: string;
  major?: string;
  kind?: string;
  identities?: unknown;
}

interface AppsEntity {
  id?: string;
  name?: string;
  department?: string;
  code?: string;
  uri?: string;
  recommend?: number | string;
}

let catalogCache: { at: number; items: ServiceItem[] } | null = null;
const CATALOG_TTL_MS = 30 * 60_000;

function assertSession(status: number, label: string): void {
  if (status === 403 || status === 401) {
    throw new SourceError(`${label} 未登录或会话过期`, {
      code: 'AUTH_REQUIRED',
      userAction: '运行 auth_login，然后重试',
    });
  }
  if (status !== 200) {
    throw new SourceError(`${label} 返回 HTTP ${status}`, {
      code: 'UPSTREAM_DOWN',
      retryable: true,
    });
  }
}

export async function getProfile(): Promise<Profile> {
  const response = await browserJson<{ entities?: AccountEntity[] }>(
    `${MY}/api/account`,
    { warmupUrl: MY + '/', timeoutMs: 20_000 },
  );
  assertSession(response.status, 'my.sjtu');
  const entity = response.json.entities?.[0];
  if (!entity) {
    throw new SourceError('my.sjtu 未返回账号信息', { code: 'SOURCE_CHANGED' });
  }
  return {
    name: entity.name ?? '',
    account: entity.account ?? '',
    studentId: entity.code ?? '',
    userType: entity.userType ?? '',
    organize: entity.organize?.name ?? '',
    classNo: entity.classNo ?? '',
    major: entity.major ?? null,
  };
}

export async function getCatalog(force = false): Promise<{
  total: number;
  items: ServiceItem[];
  cached: boolean;
}> {
  if (!force && catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return { total: catalogCache.items.length, items: catalogCache.items, cached: true };
  }
  const response = await browserJson<{ total?: number; entities?: AppsEntity[] }>(
    `${MY}/api/task/me/apps`,
    { warmupUrl: MY + '/', timeoutMs: 25_000 },
  );
  assertSession(response.status, 'my.sjtu 服务目录');
  const items = (response.json.entities ?? []).map((app) => ({
    id: app.id ?? app.code ?? '',
    name: app.name ?? '',
    department: app.department ?? '',
    code: app.code ?? '',
    uri: app.uri ?? '',
    recommend: app.recommend === 1 || app.recommend === '1',
  }));
  catalogCache = { at: Date.now(), items };
  return { total: response.json.total ?? items.length, items, cached: false };
}

export async function searchServices(
  query: string,
  limit = 20,
): Promise<{ total: number; items: ServiceItem[] }> {
  const { items } = await getCatalog();
  const keyword = query.trim().toLowerCase();
  if (!keyword) return { total: items.length, items: items.slice(0, limit) };
  const matched = items.filter((item) =>
    `${item.name} ${item.department} ${item.code}`.toLowerCase().includes(keyword),
  );
  return { total: matched.length, items: matched.slice(0, limit) };
}
