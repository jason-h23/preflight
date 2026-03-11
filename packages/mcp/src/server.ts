import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createForkTool, resetForkTool } from './tools/fork.js'
import { simulateTransactionTool } from './tools/simulate.js'
import { checkClearanceTool } from './tools/clearance.js'

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'preflight',
    version: '0.1.0',
  })

  server.tool(createForkTool.name, createForkTool.schema.shape, createForkTool.handler)
  server.tool(resetForkTool.name, resetForkTool.schema.shape, resetForkTool.handler)
  server.tool(simulateTransactionTool.name, simulateTransactionTool.schema.shape, simulateTransactionTool.handler)
  server.tool(checkClearanceTool.name, checkClearanceTool.schema.shape, checkClearanceTool.handler)

  return server
}

export async function startServer(): Promise<void> {
  if (!process.env.PREFLIGHT_FORK_URL) {
    process.stderr.write('Warning: PREFLIGHT_FORK_URL not set. simulate_transaction and create_fork will fail.\n')
  }

  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
