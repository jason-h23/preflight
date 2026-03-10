# Example: Uniswap Swap Agent

An example of testing an AI DeFi agent using preflight + clearance.

## What This Example Demonstrates

1. **Agent parsing tests** — unit-test agent logic using an LLM mock
2. **clearance permission validation** — verify the agent only operates within allowed contracts and spend limits
3. **LLM mock pattern matching** — control LLM responses with regex/string patterns

## Running

```bash
pnpm install
pnpm test
```

## Core Pattern

```ts
import { mockLLM } from '@preflight/core'
import { createClearance } from '@clearance/core'
import { createMockChatModel } from '@preflight/adapter-langchain'

// 1. Define LLM mock
const mock = mockLLM({
  responses: [
    { prompt: /swap.*ETH/i, reply: '{"action":"swap","amountIn":"1000000000000000000"}' },
  ],
})

// 2. Create LangChain-compatible mock model
const chatModel = createMockChatModel(mock)

// 3. Scope agent permissions with clearance
const clearance = createClearance({
  agent: 'swap-agent',
  permissions: {
    allowedContracts: ['0xE592427A0AEce92De3Edee1F18E0157C05861564'],
    allowedActions: ['swap'],
    spendLimit: { ETH: 2_000_000_000_000_000_000n },
    expiry: 3600, // seconds
  },
})
```
