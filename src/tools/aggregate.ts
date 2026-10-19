import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeTool } from '../core/tool.js';
import { searchAll } from '../sources/aggregate.js';

export function registerAggregateTools(server: McpServer): void {
  server.registerTool(
    'search_all',
    {
      title: '跨源搜索',
      description:
        '同时搜索水源社区、微信公众号、校园通知、活动平台，返回统一结果与各源失败警告。只读。',
      inputSchema: {
        query: z.string().min(1).describe('关键词'),
        perSource: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('每个来源最多返回条数，默认 5'),
      },
    },
    async ({ query, perSource }) =>
      executeTool(() => searchAll(query, perSource ?? 5)),
  );
}
