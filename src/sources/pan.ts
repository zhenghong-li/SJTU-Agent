import { broker } from '../browser/broker.js';
import { SourceError } from '../core/tool.js';

const PAN = 'https://pan.sjtu.edu.cn';
const SSO_URL = `${PAN}/user/v1/sign-in/sso-login-redirect/xpw8ou8y?auto_redirect=true&device_id=Chrome+155.0.0.0`;

interface Session {
  userToken: string;
  libraryId: string;
  spaceId: string;
  accessToken: string;
  expiresAt: number;
}

let cached: Session | null = null;

async function login(): Promise<Session> {
  const context = await broker.start();
  const page = await context.newPage();
  let code = '';
  try {
    await page.goto(SSO_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        code = new URL(page.url()).searchParams.get('code') ?? '';
      } catch {
        code = '';
      }
      if (code) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  } finally {
    await page.close().catch(() => undefined);
  }
  if (!code) {
    throw new SourceError('云盘 SSO 未拿到 code（jAccount 登录态可能失效）', {
      code: 'AUTH_REQUIRED',
      userAction: '运行 auth_login 后重试',
    });
  }
  const verify = await context.request.post(
    `${PAN}/user/v1/sign-in/verify-account-login/xpw8ou8y?device_id=Chrome+155.0.0.0&type=sso&credential=${encodeURIComponent(code)}`,
    { data: {}, timeout: 20_000, failOnStatusCode: false, headers: { Accept: 'application/json' } },
  );
  const verifyJson = (await verify.json().catch(() => ({}))) as { userToken?: string };
  if (!verifyJson.userToken) {
    throw new SourceError('云盘 userToken 交换失败', { code: 'AUTH_REQUIRED' });
  }
  const personal = await context.request.post(
    `${PAN}/user/v1/space/1/personal?user_token=${verifyJson.userToken}`,
    { data: {}, timeout: 20_000, failOnStatusCode: false, headers: { Accept: 'application/json' } },
  );
  const personalJson = (await personal.json().catch(() => ({}))) as {
    libraryId?: string;
    spaceId?: string;
    accessToken?: string;
    expiresIn?: number;
  };
  if (!personalJson.libraryId || !personalJson.spaceId || !personalJson.accessToken) {
    throw new SourceError('云盘空间信息获取失败', { code: 'UPSTREAM_DOWN', retryable: true });
  }
  const ttl = Number(personalJson.expiresIn) > 0 ? Number(personalJson.expiresIn) * 1000 : 6 * 3600_000;
  cached = {
    userToken: verifyJson.userToken,
    libraryId: personalJson.libraryId,
    spaceId: personalJson.spaceId,
    accessToken: personalJson.accessToken,
    expiresAt: Date.now() + Math.max(60_000, ttl - 60_000),
  };
  return cached;
}

async function session(force = false): Promise<Session> {
  if (!force && cached && cached.expiresAt > Date.now()) return cached;
  return login();
}

export interface PanEntry {
  name: string;
  path: string;
  size: number | null;
  type: string | null;
  isFolder: boolean;
  modifiedAt: string | null;
  createdAt: string | null;
}

/** Normalize pan time fields: ISO string ("2026-10-19T07:03:36.000Z") or epoch ms. */
function panTime(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric).toISOString();
    return null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric).toISOString();
  return null;
}

export async function panInfo(): Promise<{
  libraryId: string;
  spaceId: string;
  tokenExpiresAt: string;
}> {
  const current = await session();
  return {
    libraryId: current.libraryId,
    spaceId: current.spaceId,
    tokenExpiresAt: new Date(current.expiresAt).toISOString(),
  };
}

export async function panList(path = '/'): Promise<{
  path: string;
  totalNum: number | null;
  subDirCount: number | null;
  fileCount: number | null;
  entries: PanEntry[];
}> {
  const current = await session();
  const encoded = path === '/' ? '/' : `/${path.replace(/^\/+/, '')}`;
  const url = new URL(
    `${PAN}/api/v1/directory/${current.libraryId}/${current.spaceId}${encoded}`,
  );
  url.searchParams.set('user_token', current.userToken);
  url.searchParams.set('access_token', current.accessToken);
  const response = await broker
    .start()
    .then((context) =>
      context.request.get(url.href, {
        timeout: 20_000,
        failOnStatusCode: false,
        headers: { Accept: 'application/json' },
      }),
    );
  const json = (await response.json().catch(() => ({}))) as {
    contents?: Array<Record<string, unknown>>;
    totalNum?: number;
    subDirCount?: number;
    fileCount?: number;
  };
  if (response.status() === 401 || response.status() === 403) {
    cached = null;
    throw new SourceError('云盘会话过期', { code: 'AUTH_REQUIRED' });
  }
  if (response.status() !== 200) {
    throw new SourceError(`云盘目录返回 HTTP ${response.status()}`, {
      code: 'UPSTREAM_DOWN',
      retryable: true,
    });
  }
  // Field map verified against a real directory entry on 2026-10-19:
  // { name, type: "dir" | file type, path: string[], size?, creationTime,
  //   modificationTime, eTag, userId, authorityList }.
  const entries = (json.contents ?? []).map((item) => {
    const name = String(item.name ?? '');
    const type = String(item.type ?? item.fileType ?? '');
    const pathParts = Array.isArray(item.path) ? item.path.map(String) : [];
    const fullPath = pathParts.length
      ? `/${pathParts.join('/')}`
      : encoded === '/'
        ? `/${name}`
        : `${encoded}/${name}`;
    return {
      name,
      path: fullPath,
      size: item.size != null ? Number(item.size) : null,
      type,
      isFolder: /^(dir|folder)$/i.test(type) || Boolean(item.isDir),
      modifiedAt: panTime(item.modificationTime ?? item.modifiedTime),
      createdAt: panTime(item.creationTime ?? item.createdTime),
    };
  });
  return {
    path: encoded,
    totalNum: typeof json.totalNum === 'number' ? json.totalNum : null,
    subDirCount: typeof json.subDirCount === 'number' ? json.subDirCount : null,
    fileCount: typeof json.fileCount === 'number' ? json.fileCount : null,
    entries,
  };
}
