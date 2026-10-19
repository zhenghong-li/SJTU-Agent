import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeTool } from '../core/tool.js';
import { getActivity, listActivities } from '../sources/activity.js';

export function registerActivityTools(server: McpServer): void {
  server.registerTool(
    'activity_list',
    {
      title: '校园活动列表',
      description:
        '获取校园活动平台活动列表（交大之声/第二课堂/学思进阶）。返回起止时间/地点/主讲人/报名方式与名额。只读；报名需后续人工确认。',
      inputSchema: {
        type: z
          .union([z.enum(['sjtu-voice', 'second-classroom', 'learning-advanced']), z.number().int()])
          .optional()
          .describe('栏目：交大之声/第二课堂/学思进阶，或活动类型 id；不填为全部'),
        page: z.number().int().min(1).optional().describe('页码，默认 1'),
        perPage: z.number().int().min(1).max(50).optional().describe('每页条数，默认 20'),
      },
    },
    async (input) => executeTool(() => listActivities(input)),
  );

  server.registerTool(
    'activity_detail',
    {
      title: '校园活动详情',
      description:
        '读取校园活动详情：名称/简介/主办/起止时间/地点/主讲人/报名方式与名额/报名时间窗/自定义属性/本人状态。只读；报名需人工在页面确认（本工具不提交报名）。',
      inputSchema: {
        id: z.string().describe('活动 id 或详情 URL'),
      },
    },
    async ({ id }) => executeTool(() => getActivity(id)),
  );
}
