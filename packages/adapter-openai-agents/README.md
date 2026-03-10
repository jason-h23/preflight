# @preflight/adapter-openai-agents

OpenAI Agents SDK adapter for preflight — deterministic mock agent runner backed by mockLLM.

## Installation

```
pnpm add @preflight/adapter-openai-agents
```

## Quick Start

```ts
import { mockLLM } from '@preflight/core'
import { createAgentsMock } from '@preflight/adapter-openai-agents'

const mock = mockLLM({
  responses: [{ prompt: /swap/, reply: 'Swapping 1 ETH for USDC now' }],
})

const agent = createAgentsMock(mock)

const result = await agent.run('swap 1 ETH for USDC')
console.log(result.output) // 'Swapping 1 ETH for USDC now'
```

## API

- `createAgentsMock(mock)` — creates a mock client compatible with OpenAI Agents SDK `run()`
  - `mock`: a `LLMMock` instance returned by `mockLLM()`
  - returns: `MockAgentsClient` (provides a `run(input)` method)
