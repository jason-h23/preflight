import { describe, it, expect } from 'vitest'
import { assertOnChain } from './assert'
import type { AssertContext } from './assert'

describe('assertOnChain', () => {
  const mockCtx: AssertContext = {
    snapshots: {
      before: {
        balances: { '0xabc': { ETH: 10_000n, USDC: 5_000n } },
        blockNumber: 20_000_000n,
      },
      after: {
        balances: { '0xabc': { ETH: 8_000n, USDC: 7_000n } },
        blockNumber: 20_000_001n,
      },
    },
    gasUsed: 150_000n,
    approvals: [],
  }

  describe('balanceDecreased', () => {
    it('should pass when balance decreased by expected amount', () => {
      expect(() =>
        assertOnChain(mockCtx).balanceDecreased('ETH', {
          address: '0xabc',
          by: 2_000n,
        })
      ).not.toThrow()
    })

    it('should fail when balance did not decrease enough', () => {
      expect(() =>
        assertOnChain(mockCtx).balanceDecreased('ETH', {
          address: '0xabc',
          by: 5_000n,
        })
      ).toThrow('Expected ETH balance to decrease by 5000')
    })

    it('should handle missing token in before snapshot', () => {
      expect(() =>
        assertOnChain(mockCtx).balanceDecreased('DAI', {
          address: '0xabc',
          by: 1n,
        })
      ).toThrow()
    })

    it('should handle missing address in snapshots', () => {
      expect(() =>
        assertOnChain(mockCtx).balanceDecreased('ETH', {
          address: '0xunknown',
          by: 1n,
        })
      ).toThrow()
    })
  })

  describe('balanceIncreased', () => {
    it('should pass when balance increased by at least min', () => {
      expect(() =>
        assertOnChain(mockCtx).balanceIncreased('USDC', {
          address: '0xabc',
          min: 2_000n,
        })
      ).not.toThrow()
    })

    it('should fail when balance did not increase enough', () => {
      expect(() =>
        assertOnChain(mockCtx).balanceIncreased('USDC', {
          address: '0xabc',
          min: 5_000n,
        })
      ).toThrow('Expected USDC balance to increase by at least 5000')
    })

    it('should pass when increase exceeds min', () => {
      expect(() =>
        assertOnChain(mockCtx).balanceIncreased('USDC', {
          address: '0xabc',
          min: 1_000n,
        })
      ).not.toThrow()
    })
  })

  describe('gasUsed', () => {
    it('should pass when gas is within limit', () => {
      expect(() =>
        assertOnChain(mockCtx).gasUsed({ max: 300_000n })
      ).not.toThrow()
    })

    it('should fail when gas exceeds limit', () => {
      expect(() =>
        assertOnChain(mockCtx).gasUsed({ max: 100_000n })
      ).toThrow('Expected gas used to be at most 100000')
    })

    it('should pass when gas equals max', () => {
      expect(() =>
        assertOnChain(mockCtx).gasUsed({ max: 150_000n })
      ).not.toThrow()
    })
  })

  describe('noUnexpectedApprovals', () => {
    it('should pass when approvals is empty', () => {
      expect(() =>
        assertOnChain(mockCtx).noUnexpectedApprovals()
      ).not.toThrow()
    })

    it('should fail when approvals exist', () => {
      const ctxWithApprovals: AssertContext = {
        ...mockCtx,
        approvals: ['0xUSDC->0xSpender'],
      }
      expect(() =>
        assertOnChain(ctxWithApprovals).noUnexpectedApprovals()
      ).toThrow('Expected no unexpected approvals')
    })
  })

  describe('chaining', () => {
    it('should support chaining multiple assertions', () => {
      expect(() =>
        assertOnChain(mockCtx)
          .balanceDecreased('ETH', { address: '0xabc', by: 2_000n })
          .balanceIncreased('USDC', { address: '0xabc', min: 2_000n })
          .gasUsed({ max: 300_000n })
          .noUnexpectedApprovals()
      ).not.toThrow()
    })

    it('should fail at first failing assertion in chain', () => {
      expect(() =>
        assertOnChain(mockCtx)
          .gasUsed({ max: 300_000n })
          .balanceDecreased('ETH', { address: '0xabc', by: 99_999n })
          .noUnexpectedApprovals()
      ).toThrow('Expected ETH balance to decrease by 99999')
    })
  })
})
