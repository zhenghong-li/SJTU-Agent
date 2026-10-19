import { broker } from '../browser/broker.js';
import { browserJson } from '../http/browser.js';
import { SourceError } from '../core/tool.js';

const ACTIVITY = 'https://activity.sjtu.edu.cn';

const TYPE_IDS: Record<string, number> = {
  'sjtu-voice': 1,
  'second-classroom': 2,
  'learning-advanced': 24,
};

/** 报名方式枚举（GET /api/v1/dict/all → data.signupMethods，2026-10-19 实测）。 */
const SIGNUP_METHODS: Record<number, string> = {
  1: '线上报名（审核录取）',
  2: '线下报名',
  3: '线上报名（先到先得）',
  4: '无需报名',
  5: '线上报名（随机录取）',
  6: '跳转其他报名',
  7: '不显示报名方式',
};

export interface ActivitySummary {
  id: string;
  name: string;
  introduction: string;
  imageUrl: string | null;
  sponsor: string | null;
  startTime: string | null;
  endTime: string | null;
  address: string | null;
  presenter: string | null;
  signedUpNum: number | null;
  capacity: number | null;
  registrationStart: string | null;
  registrationEnd: string | null;
  signUpMethodId: number | null;
  signUpMethod: string | null;
  typeId: number | null;
  url: string;
}

export interface ActivitySignUpInfo {
  methodId: number | null;
  method: string | null;
  capacity: number | null;
  signedUpNum: number | null;
  registrationStart: string | null;
  registrationEnd: string | null;
  cancelAllowed: boolean;
  needCaptcha: boolean;
  externalSignUpUrl: string | null;
  formDesign: unknown[];
}

export interface ActivityDetail extends ActivitySummary {
  description: string;
  presenterBio: string | null;
  customProperties: Record<string, string> | null;
  signUp: ActivitySignUpInfo;
  userState: {
    inSignedUp: boolean;
    inCollection: boolean;
    inCalendar: boolean;
    hasSubscribed: boolean;
  };
  /** Web page for the activity; signUpPage is where manual registration happens. */
  signUpPage: string;
}

let cachedToken: { value: string; at: number } | null = null;

function str(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timePair(value: unknown): [string | null, string | null] {
  if (!Array.isArray(value)) return [null, null];
  return [str(value[0]), str(value[1])];
}

/** Read the activity SPA's own auth JWT (IMPSA-Token cookie, set after SSO). */
async function cookieToken(): Promise<string | null> {
  const context = await broker.start();
  const cookies = await context.cookies(ACTIVITY);
  const found = cookies.find((cookie) => cookie.name === 'IMPSA-Token' && cookie.value);
  return found?.value ?? null;
}

/**
 * Warm the activity SPA so it performs SSO and writes IMPSA-Token,
 * then return the token. This is the primary path (the OAuth code is
 * single-use and often already consumed by the SPA itself).
 */
async function warmToken(): Promise<string | null> {
  const context = await broker.start();
  const page = await context.newPage();
  try {
    await page
      .goto(`${ACTIVITY}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      .catch(() => undefined);
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const token = await cookieToken();
      if (token) return token;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return null;
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** Last-resort OAuth code flow (kept for compatibility; code may be single-use). */
async function loginForToken(): Promise<string> {
  const login = await browserJson<{ code?: number; data?: string; message?: string }>(
    `${ACTIVITY}/api/v1/login/url`,
    { timeoutMs: 20_000 },
  );
  if (login.status !== 200 || !login.json.data) {
    throw new SourceError(`活动平台未返回登录地址（HTTP ${login.status}）`, {
      code: 'AUTH_REQUIRED',
      userAction: '运行 auth_login 后重试',
    });
  }
  const context = await broker.start();
  const page = await context.newPage();
  let code = '';
  try {
    await page
      .goto(login.json.data, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      .catch(() => undefined);
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
    throw new SourceError('活动平台 OAuth 未拿到 code（jAccount 登录态可能失效）', {
      code: 'AUTH_REQUIRED',
      userAction: '运行 auth_login 后重试',
    });
  }
  const token = await browserJson<{ code?: number; data?: string }>(
    `${ACTIVITY}/api/v1/login/token?code=${encodeURIComponent(code)}`,
    { timeoutMs: 20_000 },
  );
  const value = typeof token.json.data === 'string' ? token.json.data : '';
  if (token.status !== 200 || !value) {
    // The SPA normally consumes the code itself; fall back to its cookie.
    const cookie = await cookieToken();
    if (cookie) {
      cachedToken = { value: cookie, at: Date.now() };
      return cookie;
    }
    throw new SourceError('活动平台令牌交换失败且未找到会话令牌', { code: 'AUTH_REQUIRED' });
  }
  cachedToken = { value, at: Date.now() };
  return value;
}

async function token(force = false): Promise<string> {
  if (!force && cachedToken && Date.now() - cachedToken.at < 25 * 60_000) {
    return cachedToken.value;
  }
  if (force) cachedToken = null;
  const warm = await warmToken();
  if (warm) {
    cachedToken = { value: warm, at: Date.now() };
    return warm;
  }
  return loginForToken();
}

interface ApiResult<T> {
  status: number;
  code: number | null;
  message: string;
  data: T | null;
}

/** Authorized GET that retries once after refreshing the SPA token. */
async function activityApi<T>(url: string): Promise<ApiResult<T>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const auth = await token(attempt > 0);
    const response = await browserJson<{ code?: number; data?: T; message?: string }>(url, {
      timeoutMs: 20_000,
      headers: { Authorization: `Bearer ${auth}` },
    });
    const code = response.status === 200 ? Number(response.json.code ?? 200) : response.status;
    const result: ApiResult<T> = {
      status: response.status,
      code: Number.isFinite(code) ? code : null,
      message: response.json.message ?? '',
      data: response.json.data ?? null,
    };
    if (result.code === 401 && attempt === 0) {
      cachedToken = null;
      continue;
    }
    return result;
  }
  return { status: 401, code: 401, message: '未登录', data: null };
}

function signUpMethodName(id: number | null): string | null {
  if (id === null) return null;
  return SIGNUP_METHODS[id] ?? null;
}

function activityTimeOf(raw: Record<string, unknown>, baseInfo: Record<string, unknown>): [string | null, string | null] {
  const pair = timePair(raw.activity_time);
  if (pair[0] || pair[1]) return pair;
  return [str(baseInfo.start_time), str(baseInfo.end_time)];
}

function toSummary(raw: Record<string, unknown>, typeId: number | null): ActivitySummary | null {
  const id = String(raw.id ?? '');
  const name = String(raw.name ?? '');
  if (!id || !name) return null;
  const baseInfo = (raw.base_info ?? raw) as Record<string, unknown>;
  const [startTime, endTime] = activityTimeOf(raw, baseInfo);
  const [registrationStart, registrationEnd] = timePair(raw.registration_time ?? baseInfo.registration_time);
  const methodId = num(baseInfo.method ?? raw.method ?? (raw.sign_up_info as Record<string, unknown> | undefined)?.method);
  return {
    id,
    name,
    introduction: String(raw.introduction ?? baseInfo.introduction ?? '').slice(0, 500),
    imageUrl: raw.img ? String(raw.img) : null,
    sponsor: raw.sponsor ? String(raw.sponsor) : null,
    startTime,
    endTime,
    address: str(raw.address ?? baseInfo.address),
    presenter: str(raw.presenter ?? baseInfo.presenter),
    signedUpNum: num(raw.signed_up_num ?? baseInfo.signed_up_num),
    capacity: num(raw.person_num ?? baseInfo.person_num),
    registrationStart,
    registrationEnd,
    signUpMethodId: methodId,
    signUpMethod: signUpMethodName(methodId),
    typeId,
    url: `${ACTIVITY}/activity/detail/${id}`,
  };
}

export async function listActivities(options: {
  type?: string | number;
  page?: number;
  perPage?: number;
}): Promise<{ typeId: number | null; page: number; items: ActivitySummary[] }> {
  const typeKey = typeof options.type === 'string' ? options.type : '';
  const typeId =
    typeof options.type === 'number'
      ? options.type
      : TYPE_IDS[typeKey] ?? (typeKey ? Number(typeKey) : null);
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(50, Math.max(1, options.perPage ?? 20));
  const url = new URL('/api/v1/activity/list/home', ACTIVITY);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('time_sort', 'desc');
  if (typeId !== null && Number.isFinite(typeId)) {
    url.searchParams.set('activity_type_id', String(typeId));
  }
  const response = await activityApi<unknown[]>(url.href);
  if (response.code === 401) {
    throw new SourceError('活动平台登录态失效', {
      code: 'AUTH_REQUIRED',
      userAction: '运行 auth_login 后重试',
    });
  }
  if (response.status !== 200 || ![0, 200].includes(Number(response.code))) {
    throw new SourceError(
      `活动平台返回异常（HTTP ${response.status}${response.message ? `：${response.message}` : ''}）`,
      { code: 'UPSTREAM_DOWN', retryable: true },
    );
  }
  const list = Array.isArray(response.data) ? response.data : [];
  const items = list
    .map((raw) => toSummary(raw as Record<string, unknown>, typeId))
    .filter((item): item is ActivitySummary => item !== null);
  return { typeId, page, items };
}

export async function getActivity(idOrUrl: string): Promise<ActivityDetail> {
  const match = String(idOrUrl).match(/(\d+)/);
  if (!match) throw new SourceError('无法解析活动 id', { code: 'VALIDATION' });
  const id = match[1];
  const response = await activityApi<Record<string, unknown>>(
    `${ACTIVITY}/api/v1/activity/${encodeURIComponent(id)}?detail=1`,
  );
  if (response.code === 401) {
    throw new SourceError('活动平台登录态失效', {
      code: 'AUTH_REQUIRED',
      userAction: '运行 auth_login 后重试',
    });
  }
  if (response.status !== 200 || ![0, 200].includes(Number(response.code))) {
    throw new SourceError(`活动详情返回异常（HTTP ${response.status}）`, {
      code: 'UPSTREAM_DOWN',
      retryable: true,
    });
  }
  const data = response.data ?? {};
  const base = (data.base_info ?? data) as Record<string, unknown>;
  const summary = toSummary({ ...data, ...base, id }, null);
  if (!summary) throw new SourceError('活动详情缺少字段', { code: 'SOURCE_CHANGED' });

  const signUpRaw = (data.sign_up_info ?? {}) as Record<string, unknown>;
  const [signUpStart, signUpEnd] = timePair(signUpRaw.registration_time);
  const [regStart, regEnd] = [signUpStart ?? summary.registrationStart, signUpEnd ?? summary.registrationEnd];
  const methodId = num(signUpRaw.method) ?? summary.signUpMethodId;
  const formDesign = Array.isArray(signUpRaw.form_design) ? signUpRaw.form_design : [];
  const customPropertiesRaw = str(base.custom_properties);
  let customProperties: Record<string, string> | null = null;
  if (customPropertiesRaw) {
    try {
      const parsed = JSON.parse(customPropertiesRaw) as Record<string, unknown>;
      customProperties = Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, String(value)]),
      );
    } catch {
      customProperties = null;
    }
  }
  const typeId = num(base.activity_type_id) ?? summary.typeId;

  return {
    ...summary,
    registrationStart: regStart,
    registrationEnd: regEnd,
    signUpMethodId: methodId,
    signUpMethod: signUpMethodName(methodId),
    capacity: summary.capacity ?? num(signUpRaw.person_num),
    signedUpNum: summary.signedUpNum ?? num(data.signed_up_num),
    typeId,
    description: String(base.introduction ?? data.introduction ?? '').slice(0, 4_000),
    presenterBio: str(base.presenter_bio),
    customProperties,
    signUp: {
      methodId,
      method: signUpMethodName(methodId),
      capacity: num(signUpRaw.person_num) ?? summary.capacity,
      signedUpNum: num(data.signed_up_num) ?? summary.signedUpNum,
      registrationStart: regStart,
      registrationEnd: regEnd,
      cancelAllowed: Boolean(signUpRaw.cancel_sign_up),
      needCaptcha: Boolean(signUpRaw.need_captcha),
      externalSignUpUrl: str(signUpRaw.sign_up_url),
      formDesign,
    },
    userState: {
      inSignedUp: Boolean(data.in_signed_up),
      inCollection: Boolean(data.in_collection),
      inCalendar: Boolean(data.in_calendar),
      hasSubscribed: Boolean(data.has_subscribed),
    },
    signUpPage: `${ACTIVITY}/activity/signUp/${id}`,
  };
}
