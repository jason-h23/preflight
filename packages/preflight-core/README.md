# @preflight/core

AI agent behavioral testing framework for EVM.

## Features

- **AnvilFork**: Spin up Anvil fork environments for isolated testing
- **Scenario API**: Define and run test scenarios with fork contexts
- **On-chain Assertions**: Verify balance changes, gas usage, and approvals
- **LLM Mocking**: Mock LLM responses for deterministic agent testing

## Usage

```typescript
import { preflight, assertOnChain, mockLLM, createMockOpenAI } from '@preflight/core'

// Create a test scenario
const scenario = preflight.scenario('swap agent test', {
  fork: { rpc: 'https://eth.llamarpc.com' },
})

// Run with on-chain assertions
await scenario.run(async (ctx) => {
  const block = await ctx.fork.client.getBlockNumber()
  // ... run your agent ...
})

// Mock LLM responses
const mock = mockLLM({
  responses: [
    { prompt: /swap/, reply: 'swap 1 ETH for USDC' },
  ],
})
const openai = createMockOpenAI(mock)
```

## API

### `preflight.scenario(name, options)`

Creates a test scenario with an Anvil fork environment.

### `createFork(options)`

Creates a standalone Anvil fork instance.

### `assertOnChain(ctx)`

Chainable on-chain assertion builder:
- `.balanceDecreased(token, { address, by })`
- `.balanceIncreased(token, { address, min })`
- `.gasUsed({ max })`
- `.noUnexpectedApprovals()`

### `mockLLM(options)` / `createMockOpenAI(mock)`

Create mock LLM responses for deterministic testing.
