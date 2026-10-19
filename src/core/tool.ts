import { fail, ok, type ToolEnvelope, type ToolMeta } from './result.js';

export function toText(envelope: ToolEnvelope<unknown>): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
  };
}

export function meta(extra: ToolMeta = {}): ToolMeta {
  return {
    source: 'sjtu-mcp',
    fetchedAt: new Date().toISOString(),
    cached: false,
    ...extra,
  };
}

export interface SourceErrorOptions {
  code: string;
  retryable?: boolean;
  hint?: string;
  userAction?: string;
}

export class SourceError extends Error {
  readonly code: string;
  readonly retryable?: boolean;
  readonly hint?: string;
  readonly userAction?: string;

  constructor(message: string, options: SourceErrorOptions) {
    super(message);
    this.name = 'SourceError';
    this.code = options.code;
    this.retryable = options.retryable;
    this.hint = options.hint;
    this.userAction = options.userAction;
  }
}

/** Wrap a tool implementation into the standard MCP text result. */
export async function executeTool(
  implementation: () => Promise<unknown>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    return toText(ok(await implementation(), meta()));
  } catch (error) {
    if (error instanceof SourceError) {
      return toText(
        fail(error.code, error.message, {
          retryable: error.retryable,
          hint: error.hint,
          userAction: error.userAction,
        }),
      );
    }
    return toText(
      fail('INTERNAL', error instanceof Error ? error.message : String(error)),
    );
  }
}
