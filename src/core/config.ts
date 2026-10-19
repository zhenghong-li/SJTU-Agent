import os from 'node:os';
import path from 'node:path';

export interface AppConfig {
  /** Single data directory: store / artifacts / chrome-profile / logs */
  dataDir: string;
  browser: {
    channel: 'chrome';
    port: number;
    loginTimeoutMs: number;
  };
  logging: { level: string };
}

function localAppData(): string {
  return (
    process.env.LOCALAPPDATA?.trim() ||
    path.join(os.homedir(), 'AppData', 'Local')
  );
}

/**
 * Phase A spike config loader. No filesystem writes, no network.
 * Real config file + schema validation lands in Phase B.
 */
export function loadConfig(): AppConfig {
  const dataDir =
    process.env.SJTU_MCP_DATA_DIR?.trim() ||
    path.join(localAppData(), 'sjtu-mcp');

  return {
    dataDir,
    browser: {
      channel: 'chrome',
      port: 9223,
      loginTimeoutMs: 10 * 60 * 1000,
    },
    logging: { level: process.env.SJTU_MCP_LOG_LEVEL?.trim() || 'info' },
  };
}
