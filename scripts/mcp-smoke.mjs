// Phase A A1 smoke: spawn the built stdio server and verify MCP handshake,
// tools/list, and one tools/call. Run after `npm run build`.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  cwd: process.cwd(),
  stderr: 'inherit',
});

const client = new Client(
  { name: 'sjtu-mcp-smoke', version: '0.0.1' },
  { capabilities: {} },
);

try {
  await client.connect(transport);
  console.log('[smoke] initialize ok');

  const tools = await client.listTools();
  console.log(
    '[smoke] tools:',
    tools.tools.map((tool) => tool.name).join(', '),
  );

  const result = await client.callTool({ name: 'auth_status', arguments: {} });
  const text = result.content?.[0];
  if (text && text.type === 'text') {
    const parsed = JSON.parse(text.text);
    console.log('[smoke] auth_status.ok =', parsed.ok, '| phase =', parsed.data?.phase);
  } else {
    throw new Error('unexpected tool result content');
  }

  console.log('[smoke] PASS');
  await client.close();
} catch (error) {
  console.error('[smoke] FAIL', error);
  process.exitCode = 1;
}
