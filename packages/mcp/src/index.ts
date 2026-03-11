#!/usr/bin/env node
import { startServer } from './server.js'

startServer().catch((err) => {
  process.stderr.write(`preflight MCP server error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})

export { createServer } from './server.js'
export * from './types.js'
