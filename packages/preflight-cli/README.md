# @preflight/cli

CLI runner for preflight AI agent behavioral tests.

## Installation

```
pnpm add -g @preflight/cli
```

## Quick Start

```bash
# Run a test file
preflight test ./tests/agent.test.ts

# Run with an Anvil fork
preflight test ./tests/*.test.ts --fork https://mainnet.infura.io/v3/...

# Run against a live network
preflight test ./tests/*.test.ts --live mainnet
```

## API

```ts
import { runPreflight } from '@preflight/cli'

const result = await runPreflight(['./tests/agent.test.ts'], {
  fork: 'https://mainnet.infura.io/v3/...',
})
process.exit(result.exitCode)
```

## CLI Options

- `preflight test <files...>` — run the specified test files
- `--fork <rpcUrl>` — specify the Anvil fork RPC URL
- `--live <network>` — specify the live network name
