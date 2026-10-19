import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeTool } from '../core/tool.js';
import {
  getNotice,
  listNotices,
  listSources,
} from '../sources/notices.js';

export function registerNoticeTools(server: McpServer): void {
  server.registerTool(
    'notice_sources',
    {
      title: '通知来源列表',
      description: '列出已接入的校园通知来源（教务处、新闻网、学工等）。只读。',
      inputSchema: {},
    },
    async () => executeTool(async () => ({ sources: listSources() })),
  );

  server.registerTool(
    'notice_list',
    {
      title: '通知列表',
      description:
        '按来源/分类/关键词/时间获取校园通知列表。首版来源：教务处、交大新闻网 5 栏目、学工通知/新闻。只读。',
      inputSchema: {
        sources: z
          .array(z.string())
          .optional()
          .describe('可选来源 id 列表（不填为全部已接入来源）'),
        category: z.string().optional().describe('可选分类，如 教务/新闻/学工'),
        keyword: z.string().optional().describe('可选关键词过滤'),
        since: z
          .string()
          .optional()
          .describe('可选起始时间（ISO 或 YYYY-MM-DD）'),
        limit: z.number().int().min(1).max(60).optional().describe('返回条数，默认 20'),
      },
    },
    async (input) => executeTool(() => listNotices(input)),
  );

  server.registerTool(
    'notice_search',
    {
      title: '通知搜索',
      description: '跨来源按关键词搜索校园通知。只读。',
      inputSchema: {
        query: z.string().min(1).describe('关键词'),
        sources: z.array(z.string()).optional().describe('可选来源 id 列表'),
        since: z.string().optional().describe('可选起始时间'),
        limit: z.number().int().min(1).max(60).optional().describe('返回条数，默认 20'),
      },
    },
    async ({ query, sources, since, limit }) =>
      executeTool(() => listNotices({ keyword: query, sources, since, limit })),
  );

  server.registerTool(
    'notice_get',
    {
      title: '通知正文',
      description:
        '读取通知原文（仅支持已接入来源域名：jwc/news/affairs.sjtu.edu.cn）。只读。',
      inputSchema: {
        url: z.string().url().describe('通知详情页 URL'),
      },
    },
    async ({ url }) => executeTool(() => getNotice(url)),
  );
}
