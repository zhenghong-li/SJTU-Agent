import { broker } from '../browser/broker.js';

/** jAccount cookies used by jAide's cookie-replay approach. Values are never returned. */
const JACCOUNT_COOKIE_NAMES = ['JAAuthCookie', 'JATrustCookie'] as const;
const LOGIN_URL = 'https://my.sjtu.edu.cn/';

export interface CookieSummary {
  name: string;
  domain: string;
  expiresAt: string | null;
  expired: boolean;
}

export interface JaccountStatus {
  browserStarted: boolean;
  jaccount: 'uninitialized' | 'login_window_open' | 'authenticated' | 'expired';
  cookies: CookieSummary[];
  loginUrl: string;
}

function summarizeCookies(
  cookies: Array<{ name: string; domain: string; expires: number }>,
): CookieSummary[] {
  const now = Date.now() / 1000;
  return cookies
    .filter((cookie) =>
      cookie.domain.includes('jaccount.sjtu.edu.cn') ||
      JACCOUNT_COOKIE_NAMES.includes(cookie.name as (typeof JACCOUNT_COOKIE_NAMES)[number]),
    )
    .map((cookie) => ({
      name: cookie.name,
      domain: cookie.domain,
      expiresAt:
        cookie.expires > 0 ? new Date(cookie.expires * 1000).toISOString() : null,
      expired: cookie.expires > 0 && cookie.expires <= now,
    }));
}

export function loginUrl(): string {
  return LOGIN_URL;
}

export async function jaccountStatus(): Promise<JaccountStatus> {
  const browserStarted = broker.status().started;
  if (!browserStarted) {
    return {
      browserStarted: false,
      jaccount: 'uninitialized',
      cookies: [],
      loginUrl: LOGIN_URL,
    };
  }

  const cookies = summarizeCookies(await broker.cookies());
  const auth = cookies.find(
    (cookie) => cookie.name === 'JAAuthCookie' && !cookie.expired,
  );
  return {
    browserStarted: true,
    jaccount: auth ? 'authenticated' : 'expired',
    cookies,
    loginUrl: LOGIN_URL,
  };
}

export async function startLogin(): Promise<{
  status: 'login_window_open';
  url: string;
  loginId: string;
  hint: string;
}> {
  const page = await broker.openPage(LOGIN_URL);
  // Keep the page reference alive in this module so later status checks can
  // report whether the login window is still open. We do not wait for login.
  void page;
  return {
    status: 'login_window_open',
    url: LOGIN_URL,
    loginId: `login-${Date.now()}`,
    hint: '请在打开的 Chrome 窗口中完成 jAccount 登录；随后调用 auth_status 检查登录态。',
  };
}

export async function logout(): Promise<{ closed: boolean }> {
  await broker.clearCookies();
  await broker.close();
  return { closed: true };
}
