import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeTool } from '../core/tool.js';
import { panInfo, panList } from '../sources/pan.js';

export function registerPanTools(server: McpServer): void {
  server.registerTool(
    'pan_info',
    {
      title: '云盘空间信息',
      description: '获取交大云盘 libraryId/spaceId 与 userToken 过期时间。只读。',
      inputSchema: {},
    },
    async () => executeTool(() => panInfo()),
  );

  server.registerTool(
    'pan_list',
    {
      title: '云盘目录列表',
      description:
        '列出交大云盘个人空间指定路径下的文件/文件夹（含 totalNum/subDirCount/fileCount、name/path/size/type/isFolder/modifiedAt/createdAt）。只读。',
      inputSchema: {
        path: z.string().optional().describe('目录路径，默认 /；例如 /Documents'),
      },
    },
    async ({ path }) => executeTool(() => panList(path ?? '/')),
  );
}
