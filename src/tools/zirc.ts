import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeTool } from '../core/tool.js';
import { prefillExpense, resolveProject } from '../sources/zirc.js';

const EXPENSE_TYPES = [
  '材料费',
  '测试化验加工费',
  '交通费',
  '国内差旅费',
  '会议费',
  '邮寄费',
  '培训费',
  '其他',
  '办公及印刷费',
  '劳务费',
  '因公出境差旅费',
] as const;

export function registerZircTools(server: McpServer): void {
  server.registerTool(
    'zirc_project_get',
    {
      title: 'ZIRC 项目信息',
      description:
        '读取 ZIRC 系统中指定项目编号（默认 ZIRC2026-08）的项目行信息，并解析项目详情 tag。只读。',
      inputSchema: {
        projectCode: z
          .string()
          .optional()
          .describe('项目编号，默认 ZIRC2026-08'),
      },
    },
    async ({ projectCode }) =>
      executeTool(() => resolveProject(projectCode ?? 'ZIRC2026-08')),
  );

  server.registerTool(
    'zirc_expense_prefill',
    {
      title: 'ZIRC 新增经费发生预填',
      description:
        '在 ZIRC 系统打开指定项目（默认 ZIRC2026-08）的「新增经费发生」表单，预填类型/金额/说明/发票号，停在「提交审批」前；不提交、不审批。',
      inputSchema: {
        projectCode: z
          .string()
          .optional()
          .describe('项目编号，默认 ZIRC2026-08'),
        type: z
          .enum(EXPENSE_TYPES)
          .describe('经费类型（材料费/交通费/国内差旅费/其他…）'),
        amount: z.number().positive().describe('金额（元）'),
        description: z
          .string()
          .min(1)
          .describe('说明，建议按报销摘要格式填写'),
        invoiceNo: z.string().optional().describe('发票号（可选）'),
      },
    },
    async (input) => executeTool(() => prefillExpense(input)),
  );
}
