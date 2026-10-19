import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeTool } from '../core/tool.js';
import {
  hotTopics,
  searchTopics,
  topicDetail,
} from '../sources/shuiyuan.js';

export function registerShuiyuanTools(server: McpServer): void {
  server.registerTool(
    'shuiyuan_search',
    {
      title: '水源搜索',
      description:
        '搜索上海交通大学水源社区帖子（关键词）。只读；需要 jAccount SSO 会话。',
      inputSchema: {
        query: z.string().min(1).describe('搜索关键词'),
        page: z.number().int().min(1).max(20).optional().describe('页码，默认 1'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('返回条数，默认 15'),
      },
    },
    async ({ query, page, limit }) =>
      executeTool(() => searchTopics(query, page ?? 1, limit ?? 15)),
  );

  server.registerTool(
    'shuiyuan_hot',
    {
      title: '水源热榜',
      description:
        '获取水源社区热榜（全站或指定板块），带浏览/点赞/回复数。只读。',
      inputSchema: {
        period: z
          .enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'all'])
          .optional()
          .describe('时间范围，默认 weekly'),
        category: z
          .string()
          .optional()
          .describe('可选板块名/ slug/ id，例如 校园生活'),
        limit: z.number().int().min(1).max(50).optional().describe('返回条数，默认 20'),
      },
    },
    async (input) => executeTool(() => hotTopics(input)),
  );

  server.registerTool(
    'shuiyuan_topic',
    {
      title: '水源帖子详情',
      description:
        '读取水源帖子标题、统计信息与（可选）前 30 条回复。只读；id 可传数字或帖子 URL。',
      inputSchema: {
        id: z.string().describe('帖子 id 或 URL，例如 462071 或 https://shuiyuan.sjtu.edu.cn/t/xxx/462071'),
        includeReplies: z.boolean().optional().describe('是否包含回复，默认 false'),
      },
    },
    async ({ id, includeReplies }) =>
      executeTool(() => topicDetail(id, includeReplies ?? false)),
  );
}
