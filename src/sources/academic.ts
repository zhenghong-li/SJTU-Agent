import { browserJson, browserPostForm, warmUp } from '../http/browser.js';
import { SourceError } from '../core/tool.js';

const ISJTU = 'https://i.sjtu.edu.cn';
const CALENDAR = 'https://calendar.sjtu.edu.cn';

export interface CourseSlot {
  courseName: string;
  courseCode: string;
  teacher: string;
  weekday: string;
  dayOfWeek: number | null;
  periods: string;
  weeks: string;
  classroom: string;
  credits: string;
}

export interface Timetable {
  term: {
    xnm: string;
    xqm: string;
    academicYear: string | null;
    termName: string | null;
  };
  courses: CourseSlot[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  allDay: boolean;
  source: 'personal' | 'school';
}

/** Rough SJTU term inference (fall 9–1 → 3, spring 2–6 → 12, summer 7–8 → 16). */
export function currentTerm(now = new Date()): { xnm: string; xqm: string } {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const xnm = String(month >= 9 ? year : year - 1);
  const xqm = month >= 9 || month === 1 ? '3' : month <= 6 ? '12' : '16';
  return { xnm, xqm };
}

export async function getTimetable(input?: {
  xnm?: string;
  xqm?: string;
}): Promise<Timetable> {
  const term = {
    xnm: input?.xnm?.trim() || currentTerm().xnm,
    xqm: input?.xqm?.trim() || currentTerm().xqm,
  };
  await warmUp(ISJTU + '/');
  const response = await browserPostForm(
    `${ISJTU}/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151`,
    { xnm: term.xnm, xqm: term.xqm },
    {
      warmupUrl: ISJTU + '/',
      acceptJson: true,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${ISJTU}/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151`,
      },
      timeoutMs: 20_000,
    },
  );
  if (response.status === 403 || response.status === 401) {
    throw new SourceError('i.sjtu 未登录或会话过期', {
      code: 'AUTH_REQUIRED',
      userAction: '运行 auth_login，然后重试',
    });
  }
  if (response.status !== 200) {
    throw new SourceError(`i.sjtu 课表返回 HTTP ${response.status}`, {
      code: 'UPSTREAM_DOWN',
      retryable: true,
    });
  }
  let payload: {
    xsxx?: { XNMC?: string; XQMMC?: string; XM?: string; BJMC?: string; ZYMC?: string };
    kbList?: Array<Record<string, string>>;
  };
  try {
    payload = JSON.parse(response.text);
  } catch {
    throw new SourceError('i.sjtu 课表返回非 JSON（可能需要重新登录）', {
      code: 'SOURCE_CHANGED',
    });
  }
  if (!payload.kbList) {
    throw new SourceError('i.sjtu 课表响应缺少 kbList（学期参数可能无效）', {
      code: 'NOT_FOUND',
      hint: '传入 xnm/xqm（如 2026 / 3）后重试',
    });
  }
  const courses = payload.kbList.map((row) => ({
    courseName: row.kcmc ?? '',
    courseCode: row.kch ?? '',
    teacher: row.xm ?? '',
    weekday: row.xqjmc ?? '',
    dayOfWeek: row.xqj ? Number(row.xqj) : null,
    periods: row.jcs ?? '',
    weeks: row.zcd ?? '',
    classroom: row.cdmc ?? '',
    credits: row.xf ?? '',
  }));
  return {
    term: {
      xnm: term.xnm,
      xqm: term.xqm,
      academicYear: payload.xsxx?.XNMC ?? null,
      termName: payload.xsxx?.XQMMC ?? null,
    },
    courses,
  };
}

function calendarKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export async function getCalendarEvents(
  startISO: string,
  endISO: string,
): Promise<CalendarEvent[]> {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new SourceError('start/end 不是合法时间', { code: 'VALIDATION' });
  }
  const endPlus = new Date(end.getTime() + 86_400_000);
  const url = `${CALENDAR}/api/event/list?startDate=${calendarKey(start)}+00:00&endDate=${calendarKey(endPlus)}+00:00&weekly=false&ids=`;
  const response = await browserJson<{
    success?: boolean;
    data?: {
      events?: Array<Record<string, unknown>>;
      schoolCalendar?: { events?: Array<Record<string, unknown>> };
    };
  }>(url, {
    warmupUrl: CALENDAR + '/',
    timeoutMs: 20_000,
    headers: { Referer: CALENDAR + '/' },
  });
  if (response.status === 403 || response.status === 401) {
    throw new SourceError('calendar.sjtu 未登录或会话过期', {
      code: 'AUTH_REQUIRED',
      userAction: '运行 auth_login，然后重试',
    });
  }
  if (response.status !== 200 || !response.json.success) {
    throw new SourceError(`calendar.sjtu 返回异常（HTTP ${response.status}）`, {
      code: 'UPSTREAM_DOWN',
      retryable: true,
    });
  }

  const mapEvent = (raw: Record<string, unknown>, source: CalendarEvent['source']): CalendarEvent => ({
    id: String(raw.eventId ?? raw.id ?? `${source}:${raw.title ?? ''}:${raw.startTime ?? ''}`),
    title: String(raw.title ?? raw.summary ?? ''),
    startTime: String(raw.startTime ?? ''),
    endTime: String(raw.endTime ?? ''),
    location: String(raw.location ?? ''),
    description: String(raw.description ?? ''),
    allDay: Boolean(raw.allDay ?? raw.isAllDay ?? false),
    source,
  });
  const personal = (response.json.data?.events ?? []).map((raw) => mapEvent(raw, 'personal'));
  const school = (response.json.data?.schoolCalendar?.events ?? []).map((raw) => mapEvent(raw, 'school'));
  const dedupe = new Map<string, CalendarEvent>();
  for (const event of [...personal, ...school]) {
    dedupe.set(`${event.title}|${event.startTime}|${event.endTime}`, event);
  }
  return [...dedupe.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}
