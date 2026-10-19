import { broker } from '../browser/broker.js';
import { warmUp } from '../http/browser.js';
import { SourceError } from '../core/tool.js';

const MAIL = 'https://mail.sjtu.edu.cn';
const SOAP = `${MAIL}/service/soap`;

export interface MailSummary {
  id: string;
  subject: string;
  from: { email: string; name?: string } | null;
  date: number;
  fragment: string;
  unread: boolean;
  hasAttachment: boolean;
}

export interface MailMessage {
  id: string;
  subject: string;
  from: { email: string; name?: string } | null;
  to: Array<{ email: string; name?: string }>;
  cc: Array<{ email: string; name?: string }>;
  date: number;
  text: string;
  attachments: Array<{ part: string; filename: string; contentType?: string; size: number }>;
  truncated: boolean;
}

interface ZimbraAddress {
  a?: string;
  p?: string;
  d?: string;
  t?: string;
}

interface ZimbraMessage {
  id?: string;
  su?: string;
  fr?: string;
  d?: number | string;
  f?: string;
  e?: ZimbraAddress[];
  mp?: ZimbraPart[];
}

interface ZimbraPart {
  part?: string;
  ct?: string;
  filename?: string;
  s?: number | string;
  content?: string;
  mp?: ZimbraPart[];
}

function addressOf(address?: ZimbraAddress): { email: string; name?: string } | null {
  if (!address?.a) return null;
  return { email: address.a, name: address.p ?? address.d };
}

function pick(emails: ZimbraAddress[] | undefined, type: string) {
  return (emails ?? [])
    .filter((entry) => entry.t === type)
    .map(addressOf)
    .filter((entry): entry is { email: string; name?: string } => entry !== null);
}

let cachedToken: { token: string; csrf: string; at: number } | null = null;

async function mailToken(force = false): Promise<{ token: string; csrf: string }> {
  if (!force && cachedToken && Date.now() - cachedToken.at < 30 * 60_000) {
    return cachedToken;
  }
  const context = await broker.start();
  if (force) {
    // A stale Zimbra token can make the app show its login page instead of
    // triggering SSO. Clearing only mail cookies forces a fresh SSO round.
    await context.clearCookies({ domain: 'mail.sjtu.edu.cn' }).catch(() => undefined);
  }
  const page = await context.newPage();
  try {
    await page
      .goto(MAIL + '/', { waitUntil: 'domcontentloaded', timeout: 30_000 })
      .catch(() => undefined);
    const deadline = Date.now() + 20_000;
    let token = '';
    let csrf = '';
    while (Date.now() < deadline) {
      const cookies = await context.cookies(MAIL + '/');
      token = cookies.find((cookie) => cookie.name === 'ZM_AUTH_TOKEN')?.value ?? '';
      try {
        csrf = await page.evaluate(() => String((window as unknown as { csrfToken?: string }).csrfToken ?? ''));
      } catch {
        csrf = '';
      }
      if (token && csrf) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (!token || !csrf) {
      throw new SourceError('邮箱 SSO 未建立（缺少有效的 ZM_AUTH_TOKEN / csrfToken）', {
        code: 'AUTH_REQUIRED',
        userAction: '运行 auth_login 完成 jAccount 登录，再调用 auth_probe 确认 mail 为 ok',
      });
    }
    cachedToken = { token, csrf, at: Date.now() };
    return cachedToken;
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function soap<T>(requestName: string, params: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { token, csrf } = await mailToken(attempt > 0);
    const context = await broker.start();
    const response = await context.request.post(SOAP, {
      timeout: 25_000,
      failOnStatusCode: false,
      headers: {
        'Content-Type': 'application/json',
        'X-Zimbra-Csrf-Token': csrf,
      },
      data: {
        Header: {
          context: { _jsns: 'urn:zimbra', format: { type: 'js' }, authToken: token },
        },
        Body: { [requestName]: { _jsns: 'urn:zimbraMail', ...params } },
      },
    });
    const body = await response.json().catch(() => null);
    const fault = (
      body as {
        Body?: {
          Fault?: {
            Reason?: { Text?: string };
            Detail?: { Error?: { Code?: string } };
          };
        };
      } | null
    )?.Body?.Fault;
    if (fault) {
      const code = fault.Detail?.Error?.Code;
      if (code === 'service.AUTH_REQUIRED' && attempt === 0) {
        cachedToken = null;
        continue;
      }
      throw new SourceError(
        `邮箱 SOAP ${requestName} 失败：${fault.Reason?.Text ?? code ?? 'unknown'}`,
        {
          code: code === 'service.AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'UPSTREAM_DOWN',
          retryable: code !== 'service.AUTH_REQUIRED',
        },
      );
    }
    const responseName = requestName.replace(/Request$/, '') + 'Response';
    const bodyRecord = body as { Body?: Record<string, unknown> } | null;
    return bodyRecord?.Body?.[responseName] as T;
  }
  throw new SourceError('邮箱 SOAP 重试后仍失败', { code: 'UPSTREAM_DOWN' });
}

export async function searchMail(options: {
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<{ messages: MailSummary[]; more: boolean; query: string }> {
  const query = options.query?.trim() || 'in:inbox';
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const offset = Math.max(0, options.offset ?? 0);
  const result = await soap<{ m?: ZimbraMessage[]; more?: boolean }>('SearchRequest', {
    types: 'message',
    query,
    sortBy: 'dateDesc',
    offset,
    limit,
  });
  const messages = (result.m ?? []).map((message) => ({
    id: String(message.id ?? ''),
    subject: message.su || '(无主题)',
    from: pick(message.e, 'f')[0] ?? null,
    date: Number(message.d) || 0,
    fragment: (message.fr ?? '').trim().slice(0, 160),
    unread: (message.f ?? '').includes('u'),
    hasAttachment: (message.f ?? '').includes('a'),
  }));
  return { messages, more: Boolean(result.more), query };
}

function collectText(parts: ZimbraPart[] | undefined): string {
  const chunks: string[] = [];
  const visit = (list: ZimbraPart[] | undefined) => {
    for (const part of list ?? []) {
      if (part.ct === 'text/plain' && typeof part.content === 'string') chunks.push(part.content);
      if (part.ct === 'text/html' && typeof part.content === 'string') {
        chunks.push(
          part.content
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>'),
        );
      }
      visit(part.mp);
    }
  };
  visit(parts);
  return chunks
    .join('\n\n')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectAttachments(parts: ZimbraPart[] | undefined): MailMessage['attachments'] {
  const out: MailMessage['attachments'] = [];
  const visit = (list: ZimbraPart[] | undefined) => {
    for (const part of list ?? []) {
      if (part.filename && part.part !== '1') {
        out.push({
          part: part.part ?? '',
          filename: part.filename,
          contentType: part.ct,
          size: Number(part.s) || 0,
        });
      }
      visit(part.mp);
    }
  };
  visit(parts);
  return out;
}

export async function readMail(id: string): Promise<MailMessage> {
  const result = await soap<{ m?: ZimbraMessage[] }>('GetMsgRequest', {
    m: { id, html: 1, needExp: 1, maxInlinedLength: 0, want: { content: 1 } },
  });
  const message = result.m?.[0];
  if (!message) {
    throw new SourceError(`邮件 ${id} 不存在或已删除`, { code: 'NOT_FOUND' });
  }
  const text = collectText(message.mp);
  const truncated = text.length > 8_000;
  return {
    id: String(message.id ?? id),
    subject: message.su || '(无主题)',
    from: pick(message.e, 'f')[0] ?? null,
    to: pick(message.e, 't'),
    cc: pick(message.e, 'c'),
    date: Number(message.d) || 0,
    text: truncated ? text.slice(0, 8_000) : text,
    attachments: collectAttachments(message.mp),
    truncated,
  };
}

/** Save a message to the Drafts folder (never sends). Experimental Zimbra API. */
export async function saveDraft(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ draftId: string | null; saved: boolean }> {
  const result = await soap<{ m?: Array<{ id?: string }> }>('SaveDraftRequest', {
    m: {
      e: [{ t: 't', a: input.to }],
      su: input.subject,
      mp: { ct: 'text/plain', content: input.body },
    },
  });
  return { draftId: result.m?.[0]?.id ? String(result.m[0].id) : null, saved: true };
}
