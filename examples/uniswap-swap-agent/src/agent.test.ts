import { describe, it, expect } from 'vitest'
import { mockLLM } from '@preflight/core'
import { createClearance } from '@clearance/core'
import { createMockChatModel } from '@preflight/adapter-langchain'
import { runSwapAgent } from './agent.js'

const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564'

describe('Uniswap Swap Agent — preflight scenarios', () => {
  // ────────────────────────────────────
  // 1. Agent unit tests (no Anvil required)
  // ────────────────────────────────────
  describe('agent parsing', () => {
    it('should correctly parse an ETH→USDC swap message', async () => {
      const intent = await runSwapAgent('Please swap my ETH to USDC')
      expect(intent).not.toBeNull()
      expect(intent?.tokenIn).toBe('ETH')
      expect(intent?.tokenOut).toBe('USDC')
      expect(intent?.amountIn).toBe(1000000000000000000n)
    })

    it('should return null for non-swap actions', async () => {
      const intent = await runSwapAgent('Please check balance')
      expect(intent).toBeNull()
    })
  })

  // ────────────────────────────────────
  // 2. clearance permission validation tests
  // ────────────────────────────────────
  describe('clearance permission validation', () => {
    it('should pass for an allowed contract + action', () => {
      const clearance = createClearance({
        agent: 'swap-agent',
        permissions: {
          allowedContracts: [UNISWAP_V3_ROUTER],
          allowedActions: ['swap'],
          spendLimit: { ETH: 2_000_000_000_000_000_000n }, // 2 ETH
          expiry: 3600, // 1 hour in seconds
        },
      })

      expect(() =>
        clearance.validate({
          contract: UNISWAP_V3_ROUTER,
          action: 'swap',
          spend: { token: 'ETH', amount: 1_000_000_000_000_000_000n },
        })
      ).not.toThrow()
    })

    it('should block a disallowed contract', () => {
      const clearance = createClearance({
        agent: 'swap-agent',
        permissions: {
          allowedContracts: [UNISWAP_V3_ROUTER],
          allowedActions: ['swap'],
          spendLimit: { ETH: 2_000_000_000_000_000_000n },
          expiry: 3600,
        },
      })

      expect(() =>
        clearance.validate({
          contract: '0xMaliciousContract',
          action: 'swap',
          spend: { token: 'ETH', amount: 1_000_000_000_000_000_000n },
        })
      ).toThrow()
    })

    it('should block spend over the limit', () => {
      const clearance = createClearance({
        agent: 'swap-agent',
        permissions: {
          allowedContracts: [UNISWAP_V3_ROUTER],
          allowedActions: ['swap'],
          spendLimit: { ETH: 500_000_000_000_000_000n }, // 0.5 ETH
          expiry: 3600,
        },
      })

      expect(() =>
        clearance.validate({
          contract: UNISWAP_V3_ROUTER,
          action: 'swap',
          spend: { token: 'ETH', amount: 1_000_000_000_000_000_000n }, // 1 ETH — exceeds limit
        })
      ).toThrow()
    })
  })

  // ────────────────────────────────────
  // 3. Direct LLM mock tests
  // ────────────────────────────────────
  describe('LLM mock pattern matching', () => {
    it('mockLLM should correctly match a regex pattern', () => {
      const mock = mockLLM({
        responses: [
          { prompt: /swap.*ETH/i, reply: 'confirmed' },
        ],
      })
      expect(mock.resolve('swap 1 ETH to USDC')).toBe('confirmed')
    })

    it('createMockChatModel should match based on the last message', async () => {
      const mock = mockLLM({
        responses: [{ prompt: /approve/i, reply: 'approved' }],
      })
      const model = createMockChatModel(mock)
      const result = await model.invoke([
        { role: 'system', content: 'You are a DeFi agent' },
        { role: 'user', content: 'please approve the USDC spend' },
      ])
      expect(result.content).toBe('approved')
    })
  })
})
