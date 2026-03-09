#!/usr/bin/env node
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    fork: { type: 'string' },
    live: { type: 'string' },
  },
  allowPositionals: true,
})

const [command, ...files] = positionals

if (command === 'test') {
  console.log(`Running preflight tests on: ${files.join(', ')}`)
  console.log(`Fork: ${values.fork ?? 'none'}, Live: ${values.live ?? 'none'}`)
  // TODO: run vitest programmatically
} else {
  console.log('Usage: preflight test <files> [--fork <rpc>] [--live <network>]')
}
