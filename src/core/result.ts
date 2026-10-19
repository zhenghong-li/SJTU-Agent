export interface ToolMeta {
  source?: string;
  fetchedAt?: string;
  cached?: boolean;
  stale?: boolean;
  warnings?: string[];
  [key: string]: unknown;
}

export interface ToolError {
  code: string;
  message: string;
  retryable?: boolean;
  hint?: string;
  userAction?: string;
}

export type ToolEnvelope<T> =
  | { ok: true; data: T; meta: ToolMeta }
  | { ok: false; error: ToolError };

export function ok<T>(data: T, meta: ToolMeta = {}): ToolEnvelope<T> {
  return { ok: true, data, meta };
}

export function fail(
  code: string,
  message: string,
  extra: Omit<ToolError, 'code' | 'message'> = {},
): ToolEnvelope<never> {
  return { ok: false, error: { code, message, ...extra } };
}
