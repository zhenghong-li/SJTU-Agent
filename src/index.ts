import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './core/config.js';
import { ok } from './core/result.js';
import { meta, toText } from './core/tool.js';
import {
  jaccountStatus,
  loginUrl,
  logout,
  startLogin,
} from './auth/jaccount.js';
import { probeServices } from './auth/probe.js';
import { registerShuiyuanTools } from './tools/shuiyuan.js';
import { registerWechatTools } from './tools/wechat.js';
import { registerNoticeTools } from './tools/notices.js';
import { registerAcademicTools } from './tools/academic.js';
import { registerServiceTools } from './tools/services.js';
import { registerMailTools } from './tools/mail.js';
import { registerActivityTools } from './tools/activity.js';
import { registerAggregateTools } from './tools/aggregate.js';
import { registerReimburseTools } from './tools/reimburse.js';
import { registerPanTools } from './tools/pan.js';
import { registerZircTools } from './tools/zirc.js';

const SERVER_NAME = 'sjtu-mcp';
const SERVER_VERSION = '0.2.0';

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

/**
 * Non-blocking login: opens a visible Chrome page and returns immediately.
 * The user completes jAccount login manually; auth_status reports the result.
 */
server.registerTool(
  'auth_login',
  {
    title: 'jAccount 登录',
    description:
      '打开本机 Chrome 的 jAccount 登录页（非阻塞）。需用户在窗口内手动完成登录，随后用 auth_status/auth_probe 检查登录态。',
    inputSchema: {},
  },
  async () => {
    const result = await startLogin();
    return toText(
      ok(
        {
          status: result.status,
          url: result.url,
          loginId: result.loginId,
          hint: result.hint,
        },
        meta(),
      ),
    );
  },
);

server.registerTool(
  'auth_status',
  {
    title: '认证状态',
    description:
      '查看 jAccount 登录态（只检查浏览器 cookie，不联网、不输出 cookie 值）。',
    inputSchema: {},
  },
  async () => {
    const config = loadConfig();
    const status = await jaccountStatus();
    return toText(
      ok(
        {
          server: { name: SERVER_NAME, version: SERVER_VERSION },
          browser: {
            started: status.browserStarted,
            profileDir: `${config.dataDir}\\chrome-profile`,
            port: config.browser.port,
          },
          jaccount: status.jaccount,
          cookies: status.cookies,
          loginUrl: status.loginUrl,
          dataDir: config.dataDir,
        },
        meta(),
      ),
    );
  },
);

server.registerTool(
  'auth_probe',
  {
    title: '服务登录态探测',
    description:
      '用当前浏览器共享会话只读探测 my.sjtu / i.sjtu / calendar / 水源 / 邮箱 / 云盘 / 活动平台的登录态，不返回 cookie 值。',
    inputSchema: {
      services: z
        .array(z.string())
        .optional()
        .describe('可选，限定探测的服务；不填探测全部'),
    },
  },
  async ({ services }) => {
    const results = await probeServices(services);
    return toText(
      ok(
        {
          results,
          note: '只读 GET；判定依据为 HTTP 状态 + 最终 URL + 响应特征，不读取 cookie 值。',
        },
        meta(),
      ),
    );
  },
);

server.registerTool(
  'auth_logout',
  {
    title: '退出登录',
    description: '清除浏览器 cookie 并关闭 MCP 管理的 Chrome 实例（本地状态操作）。',
    inputSchema: {},
  },
  async () => {
    const result = await logout();
    return toText(
      ok({ closed: result.closed, loginUrl: loginUrl() }, meta()),
    );
  },
);

registerShuiyuanTools(server);
registerWechatTools(server);
registerNoticeTools(server);
registerAcademicTools(server);
registerServiceTools(server);
registerMailTools(server);
registerActivityTools(server);
registerAggregateTools(server);
registerReimburseTools(server);
registerPanTools(server);
registerZircTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  // stdout is reserved for JSON-RPC; diagnostics go to stderr.
  console.error(
    JSON.stringify({
      level: 'fatal',
      msg: 'sjtu-mcp failed to start',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
