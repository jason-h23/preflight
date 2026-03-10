# preflight + clearance

> Open-source developer SDK for validating and safely executing EVM on-chain actions by AI agents

## Packages

| Package | Description | Phase |
|--------|------|-------|
| [`@preflight/core`](./packages/preflight-core) | AnvilFork + Scenario API + On-chain assertions | Phase 1 |
| [`@clearance/core`](./packages/clearance-core) | EIP-7702-based agent execution permission management | Phase 2 |
| [`@preflight/cli`](./packages/preflight-cli) | CLI test runner | Phase 3 |

## Why preflight

When an AI agent executes real on-chain transactions on a DeFi protocol, how do you verify it behaves exactly as intended? Testing on a live chain risks asset loss on mistakes, and simple mocks cannot reproduce the EVM execution environment.

**preflight** is a framework for declaratively testing AI agent on-chain behavior on top of an Anvil fork.

- **Real Anvil process** — not a mock, actual EVM execution environment
- **Any EVM chain** — Ethereum, Optimism, Base, Arbitrum, Tokamak L2
- **Any LLM framework** — LangChain, OpenAI Agents SDK, CrewAI
- **bigint-only** — no precision loss at wei granularity
- **Complements EVMbench** — security (EVMbench) + behavioral testing (preflight)

## Quick Start

```bash
pnpm add @preflight/core
```

```typescript
import { preflight, assertOnChain, mockLLM, createMockOpenAI } from '@preflight/core'

// 1. Declare scenario
const scenario = preflight.scenario('1 ETH swap on Uniswap', {
  fork: {
    rpc: process.env.FORK_RPC_URL!,
    blockNumber: 20_000_000n, // fixed reproducible block
  },
})

// 2. Mock the LLM — deterministic tests without real OpenAI calls
const mock = mockLLM({
  responses: [
    { prompt: /swap/, reply: 'swap 1 ETH for USDC on Uniswap V3' },
  ],
})
const openai = createMockOpenAI(mock)

// 3. Run scenario + on-chain assertions
await scenario.run(async (ctx) => {
  // Snapshot before agent execution
  const before = {
    balances: { '0xUserAddress': { ETH: 10_000_000_000_000_000_000n } },
    blockNumber: await ctx.fork.client.getBlockNumber(),
  }

  // Run AI agent (deterministically controlled via mockLLM)
  const reply = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'swap 1 ETH for USDC' }],
  })

  // Snapshot after agent execution
  const after = {
    balances: { '0xUserAddress': { ETH: 8_950_000_000_000_000_000n } },
    blockNumber: await ctx.fork.client.getBlockNumber(),
  }

  // On-chain assertions (chainable)
  assertOnChain({ snapshots: { before, after }, gasUsed: 150_000n, approvals: [] })
    .balanceDecreased('ETH', { address: '0xUserAddress', by: 1_000_000_000_000_000_000n })
    .gasUsed({ max: 300_000n })
    .noUnexpectedApprovals()
})
```

## clearance — Permission Scoping

```bash
pnpm add @clearance/core
```

```typescript
import { createClearance } from '@clearance/core'

const clearance = createClearance({
  agent: '0xAgentAddress',
  permissions: {
    allowedContracts: ['0xUniswapV3Router'],
    allowedActions: ['swap'],
    spendLimit: { ETH: 1_000_000_000_000_000_000n }, // 1 ETH max
    expiry: 86400, // 24 hours
  },
})

// Validate before agent execution
clearance.validate({ action: 'swap', contract: '0xUniswapV3Router' }) // OK
clearance.validate({ action: 'transfer', contract: '0xUniswap' })     // throws!
```

## Environment Variables

```bash
# .env
FORK_RPC_URL=https://rpc.mevblocker.io    # RPC URL for EVM fork (required)
FORK_BLOCK_NUMBER=20000000                # Fixed reproducible block number (optional)
```

## Development

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Run tests for a specific package
cd packages/preflight-core && pnpm test
cd packages/clearance-core && pnpm test

# Build
pnpm build
```

## Project Structure

```
preflight/
├── packages/
│   ├── preflight-core/     # @preflight/core
│   │   └── src/
│   │       ├── fork.ts     # createFork() — creates AnvilFork
│   │       ├── scenario.ts # preflight.scenario() — declares a scenario
│   │       ├── assert.ts   # assertOnChain() — on-chain assertions
│   │       ├── mock-llm.ts # mockLLM() — LLM mocking
│   │       └── index.ts    # entry point
│   ├── clearance-core/     # @clearance/core
│   │   └── src/
│   │       ├── clearance.ts # createClearance() — permission scoping
│   │       └── index.ts
│   └── preflight-cli/      # @preflight/cli (Phase 3)
├── pnpm-workspace.yaml
└── package.json
```

## Roadmap

| Phase | Feature | Status |
|-------|------|------|
| Phase 1 | AnvilFork + Scenario API + On-chain assertions | ✅ Done |
| Phase 2 | clearance permission scoping SDK | ✅ Done |
| Phase 3 | CLI + LangChain/OpenAI adapters | Planned |
| Phase 4 | npm publish + examples + Tokamak adapter | Planned |
| Phase 5+ | EIP-7702 live signing + testnet | TBD |

## License

MIT
