import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeTool } from '../core/tool.js';
import {
  FINANCE_FORM_URL,
  prefillReimbursement,
} from '../browser/finance.js';

/**
 * Field-level reimbursement prefill (报销预填).
 *
 * Verified against the live finance SPA on 2026-10-19:
 *   发票管理 (select invoice) -> 报销项目 (choose 经费项目) -> 摘要 (description)
 * then STOPS. The tool never clicks 「提交预约单」/ 支付, and never sends mail.
 */
export function registerReimburseTools(server: McpServer): void {
  server.registerTool(
    'reimburse_prefill',
    {
      title: '报销字段级预填（不提交）',
      description:
        '在已登录浏览器中打开「AI自助报销」日常报销表单，按需上传 PDF 发票（OCR）、勾选已有发票、选择经费/项目（报销项目）、填写摘要，然后停在提交前，返回截图路径与你需要手动确认的项。绝不点击提交/支付。',
      inputSchema: {
        invoiceFiles: z
          .array(z.string())
          .optional()
          .describe('本地发票文件路径（PDF/JPG/PNG），通过「发票管理 → 上传发票」OCR 上传'),
        invoiceQuery: z
          .string()
          .optional()
          .describe('已有发票的搜索关键词：销售方/平台、金额（如「XX.XX」）、标签或开票日期'),
        selectAllMatches: z
          .boolean()
          .optional()
          .describe('invoiceQuery 命中多张时是否全选（默认只选第一张）'),
        fundingSource: z
          .string()
          .optional()
          .describe('经费/项目关键词：项目名称、项目编号或财务编号；不填则选第一个可用项目'),
        description: z.string().optional().describe('摘要（简短说明，如「市内交通费报销」）'),
        openOnly: z
          .boolean()
          .optional()
          .describe('仅打开表单页，不做字段预填（旧行为兜底）'),
      },
    },
    async (input) =>
      executeTool(async () => {
        const result = await prefillReimbursement(input);
        return {
          ...result,
          tool: 'reimburse_prefill',
          formUrl: FINANCE_FORM_URL,
          note: 'MCP 只做预填；提交、支付均需你本人在页面中完成。',
        };
      }),
  );
}
