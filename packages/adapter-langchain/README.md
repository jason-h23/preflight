# @preflight/adapter-langchain

LangChain adapter for preflight — deterministic mock chat model backed by mockLLM.

## Installation

```
pnpm add @preflight/adapter-langchain
```

## Quick Start

```ts
import { mockLLM } from '@preflight/core'
import { createMockChatModel } from '@preflight/adapter-langchain'

const mock = mockLLM({
  responses: [{ prompt: /swap/, reply: 'I will swap 1 ETH for USDC' }],
})

const chatModel = createMockChatModel(mock)

const result = await chatModel.invoke([
  { role: 'user', content: 'Please swap 1 ETH for USDC' },
])
console.log(result.content) // 'I will swap 1 ETH for USDC'
```

## API

- `createMockChatModel(mock)` — creates a mock model compatible with LangChain `BaseChatModel.invoke()`
  - `mock`: a `LLMMock` instance returned by `mockLLM()`
  - returns: `MockChatModel` (provides an `invoke(messages)` method)
