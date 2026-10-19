import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeTool } from '../core/tool.js';
import { getCalendarEvents, getTimetable } from '../sources/academic.js';

export function registerAcademicTools(server: McpServer): void {
  server.registerTool(
    'timetable_get',
    {
      title: '课表',
      description:
        '获取 i.sjtu 本科生课表（默认当前学期），返回课程、教师、星期、节次、周次、教室、学分。只读。',
      inputSchema: {
        xnm: z.string().optional().describe('学年，例如 2026；不填自动推断'),
        xqm: z
          .string()
          .optional()
          .describe('学期代码：3=秋季，12=春季，16=夏季；不填自动推断'),
      },
    },
    async (input) => executeTool(() => getTimetable(input)),
  );

  server.registerTool(
    'calendar_events',
    {
      title: '校历/个人日历事件',
      description:
        '读取 calendar.sjtu 的校历与个人日历事件（默认今天起 7 天）。只读。',
      inputSchema: {
        start: z.string().optional().describe('开始时间 ISO，默认今天'),
        end: z.string().optional().describe('结束时间 ISO，默认 7 天后'),
        days: z.number().int().min(1).max(90).optional().describe('未给 start/end 时的天数，默认 7'),
      },
    },
    async ({ start, end, days }) => {
      const startDate = start ? new Date(start) : new Date();
      const endDate = end
        ? new Date(end)
        : new Date(startDate.getTime() + (days ?? 7) * 86_400_000);
      return executeTool(() =>
        getCalendarEvents(startDate.toISOString(), endDate.toISOString()),
      );
    },
  );
}
