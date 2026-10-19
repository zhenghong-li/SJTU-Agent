import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeTool, SourceError } from '../core/tool.js';
import { broker } from '../browser/broker.js';
import {
  getCatalog,
  getProfile,
  searchServices,
} from '../sources/services.js';

export function registerServiceTools(server: McpServer): void {
  server.registerTool(
    'profile_get',
    {
      title: '我的身份信息',
      description: '读取 jAccount/交我办账号的姓名、学号、学院、班级、专业。只读。',
      inputSchema: {},
    },
    async () => executeTool(() => getProfile()),
  );

  server.registerTool(
    'services_catalog',
    {
      title: '交我办服务目录',
      description:
        '获取交我办办事大厅的服务目录（约 300 项），可按名称/部门/代码过滤。只读；缓存 30 分钟。',
      inputSchema: {
        query: z.string().optional().describe('可选关键词过滤'),
        limit: z.number().int().min(1).max(200).optional().describe('返回条数，默认 50'),
        refresh: z.boolean().optional().describe('是否强制刷新缓存'),
      },
    },
    async ({ query, limit, refresh }) => {
      const result = await getCatalog(refresh ?? false);
      const keyword = query?.trim().toLowerCase();
      const items = keyword
        ? result.items.filter((item) =>
            `${item.name} ${item.department} ${item.code}`.toLowerCase().includes(keyword),
          )
        : result.items;
      return executeTool(async () => ({
        total: result.total,
        matched: items.length,
        cached: result.cached,
        items: items.slice(0, limit ?? 50),
      }));
    },
  );

  server.registerTool(
    'services_search',
    {
      title: '交我办服务搜索',
      description: '在交我办服务目录中按关键词搜索事项（名称/部门/代码）。只读。',
      inputSchema: {
        query: z.string().min(1).describe('关键词，例如 报销 / 成绩单 / 户籍'),
        limit: z.number().int().min(1).max(100).optional().describe('返回条数，默认 20'),
      },
    },
    async ({ query, limit }) => executeTool(() => searchServices(query, limit ?? 20)),
  );

  server.registerTool(
    'services_open',
    {
      title: '打开交我办事项',
      description:
        '按服务 id/code 在浏览器中打开交我办事项（已登录态）。只打开页面，不提交任何表单。',
      inputSchema: {
        id: z.string().describe('服务 id 或 code（来自 services_search）'),
        uri: z.string().url().optional().describe('也可直接给事项 URI'),
      },
    },
    async ({ id, uri }) =>
      executeTool(async () => {
        const catalog = await getCatalog();
        const item = catalog.items.find(
          (entry) => entry.id === id || entry.code === id,
        );
        const target = uri ?? item?.uri;
        if (!target) {
          throw new SourceError(`未找到服务：${id}`, { code: 'NOT_FOUND' });
        }
        const page = await broker.openPage(target);
        const title = await page.title().catch(() => '');
        return { status: 'opened', url: target, title, submitted: false };
      }),
  );
}
