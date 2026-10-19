import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeTool } from '../core/tool.js';
import { readMail, saveDraft, searchMail } from '../sources/mail.js';

export function registerMailTools(server: McpServer): void {
  server.registerTool(
    'mail_search',
    {
      title: '邮箱搜索',
      description:
        '搜索交大邮箱历史邮件（Zimbra 搜索语法；默认 in:inbox，可 in:anywhere / 关键词 / is:unread 等）。只读。',
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe('Zimbra 搜索语句，默认 in:inbox；例如 奖学金 in:anywhere'),
        limit: z.number().int().min(1).max(50).optional().describe('返回条数，默认 20'),
        offset: z.number().int().min(0).optional().describe('偏移量，默认 0'),
      },
    },
    async (input) => executeTool(() => searchMail(input)),
  );

  server.registerTool(
    'mail_read',
    {
      title: '读取邮件',
      description: '按邮件 id 读取正文、收发件人、附件列表（正文截断 8000 字）。只读。',
      inputSchema: {
        id: z.string().describe('邮件 id（来自 mail_search）'),
      },
    },
    async ({ id }) => executeTool(() => readMail(id)),
  );

  server.registerTool(
    'mail_draft',
    {
      title: '存邮件草稿',
      description:
        '把邮件保存到草稿箱（绝不发送）。实验性 Zimbra API；保存后需人工在邮箱里确认。',
      inputSchema: {
        to: z.string().describe('收件人邮箱'),
        subject: z.string().describe('主题'),
        body: z.string().describe('正文纯文本'),
      },
    },
    async (input) => executeTool(() => saveDraft(input)),
  );
}
