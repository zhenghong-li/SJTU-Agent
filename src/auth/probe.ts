import { broker } from '../browser/broker.js';

export type ProbeService =
  | 'my'
  | 'isjtu'
  | 'calendar'
  | 'shuiyuan'
  | 'mail'
  | 'pan'
  | 'activity';

export interface ServiceProbe {
  service: string;
  ok: boolean;
  status: number | null;
  finalUrl: string;
  note: string;
}

interface ProbeDefinition {
  service: ProbeService;
  /** Page to open once in the real browser to establish the site's SSO session. */
  warmupUrl?: string;
  url: string;
  /** Optional response-body marker that proves an authenticated payload. */
  marker?: string;
  /** If the final URL contains this, the session was not established. */
  loginMarker?: string;
}

function todayKey(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

const CALENDAR_START = todayKey(0);
const CALENDAR_END = todayKey(7);

const PROBES: ProbeDefinition[] = [
  {
    service: 'my',
    url: 'https://my.sjtu.edu.cn/api/account',
    marker: 'account',
    loginMarker: 'jaccount.sjtu.edu.cn',
  },
  {
    service: 'isjtu',
    url: 'https://i.sjtu.edu.cn/jaccountlogin',
    loginMarker: 'jaccount.sjtu.edu.cn',
  },
  {
    service: 'calendar',
    warmupUrl: 'https://calendar.sjtu.edu.cn/',
    // Format used by jAide: `YYYY-MM-DD+00:00` (literal plus is accepted by the API).
    url: `https://calendar.sjtu.edu.cn/api/event/list?startDate=${CALENDAR_START}+00:00&endDate=${CALENDAR_END}+00:00&weekly=false&ids=`,
    marker: '"success":true',
    loginMarker: 'jaccount.sjtu.edu.cn',
  },
  {
    service: 'shuiyuan',
    warmupUrl: 'https://shuiyuan.sjtu.edu.cn/',
    url: 'https://shuiyuan.sjtu.edu.cn/search.json?q=%E9%A3%9F%E5%A0%82',
    marker: 'topics',
  },
  {
    service: 'mail',
    url: 'https://mail.sjtu.edu.cn/',
    loginMarker: 'jaccount.sjtu.edu.cn',
  },
  {
    service: 'pan',
    url: 'https://pan.sjtu.edu.cn/',
    loginMarker: 'jaccount.sjtu.edu.cn',
  },
  {
    service: 'activity',
    url: 'https://activity.sjtu.edu.cn/',
    loginMarker: 'jaccount.sjtu.edu.cn',
  },
];

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(invalid-url)';
  }
}

async function warmup(url: string): Promise<void> {
  const context = await broker.start();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch {
    // Warmup is best-effort; the API probe decides the outcome.
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * Phase A A3: probe known campus endpoints using the browser's shared cookie
 * jar via Playwright context.request. Read-only; never returns cookie values.
 */
export async function probeServices(
  requested?: string[],
): Promise<ServiceProbe[]> {
  const context = await broker.start();
  const wanted = new Set(
    requested?.length ? requested : PROBES.map((p) => p.service),
  );
  const output: ServiceProbe[] = [];

  for (const probe of PROBES) {
    if (!wanted.has(probe.service)) continue;
    try {
      if (probe.warmupUrl) await warmup(probe.warmupUrl);
      const response = await context.request.get(probe.url, {
        timeout: 15_000,
        failOnStatusCode: false,
      });
      const finalUrl = response.url();
      const status = response.status();
      const body = await response.text().catch(() => '');
      const loggedOut = probe.loginMarker
        ? finalUrl.includes(probe.loginMarker)
        : false;
      const markerOk = probe.marker ? body.includes(probe.marker) : true;
      const ok = !loggedOut && status >= 200 && status < 400 && markerOk;
      output.push({
        service: probe.service,
        ok,
        status,
        finalUrl: safeHost(finalUrl),
        note: loggedOut
          ? 'redirected to login'
          : markerOk
            ? ok
              ? 'session ok'
              : 'unexpected response'
            : `missing marker "${probe.marker}"`,
      });
    } catch (error) {
      output.push({
        service: probe.service,
        ok: false,
        status: null,
        finalUrl: '',
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return output;
}
