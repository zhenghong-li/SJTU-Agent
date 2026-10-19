import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeTool } from '../core/tool.js';
import {
  readArticle,
  resolveSogouLink,
  searchArticles,
} from '../sources/wechat.js';

export function registerWechatTools(server: McpServer): void {
  server.registerTool(
    'wechat_search',
    {
      title: '公众号文章搜索',
      description:
        '搜索微信公众号文章（搜狗微信搜索）：标题/摘要/公众号/发布时间/跳转链接。只读。',
      inputSchema: {
        query: z.string().min(1).describe('搜索关键词'),
        page: z.number().int().min(1).max(10).optional().describe('页码，默认 1'),
      },
    },
    async ({ query, page }) => executeTool(() => searchArticles(query, page ?? 1)),
  );

  server.registerTool(
    'wechat_read_article',
    {
      title: '公众号正文',
      description:
        '读取微信文章直链（https://mp.weixin.qq.com/s/...）的标题/公众号/时间/正文。只读。',
      inputSchema: {
        url: z.string().url().describe('微信文章直链'),
        maxChars: z
          .number()
          .int()
          .min(1000)
          .max(20000)
          .optional()
          .describe('正文最大字符数，默认 8000'),
      },
    },
    async ({ url, maxChars }) =>
      executeTool(() => readArticle(url, maxChars ?? 8000)),
  );

  server.registerTool(
    'wechat_resolve_url',
    {
      title: '解析公众号文章链接',
      description:
        '用真实 Chrome 打开搜狗跳转链接，解析出 mp.weixin.qq.com 文章直链（供 wechat_read_article 使用）。较慢。',
      inputSchema: {
        link: z.string().describe('weixin.sogou.com/link? 形式的跳转链接'),
      },
    },
    async ({ link }) => executeTool(async () => ({ url: await resolveSogouLink(link) })),
  );
}
