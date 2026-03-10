# @clearance/core

SDK for validating agent permission scopes before execution.

## Installation

```
pnpm add @clearance/core
```

## Quick Start

```ts
import { createClearance } from '@clearance/core'

const clearance = createClearance({
  allowedContracts: ['0xUniswapV3Router'],
  maxSpend: { ETH: 1_000_000_000_000_000_000n },
  expiresAt: Date.now() + 3600_000,
})

clearance.validate({ contract: '0xUniswapV3Router', action: 'swap' })
```

## API

- `createClearance(options)` — create a permission scope
- `clearance.validate(action)` — throws on disallowed actions
- `clearance.check(action)` — returns boolean
- `clearance.isExpired()` — whether the scope has expired
- `clearance.spentAmounts` — accumulated spend totals
