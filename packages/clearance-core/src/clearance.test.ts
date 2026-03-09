import { describe, it, expect } from 'vitest'
import { createClearance } from './clearance'

describe('createClearance', () => {
  const baseOptions = {
    agent: '0xagent',
    permissions: {
      allowedContracts: ['0xUniswap'],
      allowedActions: ['swap'],
      spendLimit: { ETH: 1_000_000_000_000_000_000n }, // 1 ETH
      expiry: 86400, // 24h in seconds
    },
  } as const

  it('should create clearance with correct agent and permissions', () => {
    const clearance = createClearance(baseOptions)
    expect(clearance.agent).toBe('0xagent')
    expect(clearance.permissions.allowedContracts).toContain('0xUniswap')
    expect(clearance.permissions.allowedActions).toContain('swap')
    expect(clearance.permissions.spendLimit.ETH).toBe(1_000_000_000_000_000_000n)
    expect(clearance.permissions.expiry).toBe(86400)
  })

  it('should not throw for valid action and contract', () => {
    const clearance = createClearance(baseOptions)
    expect(() => clearance.validate({ action: 'swap', contract: '0xUniswap' })).not.toThrow()
  })

  it('should throw for action not in allowedActions', () => {
    const clearance = createClearance(baseOptions)
    expect(() => clearance.validate({ action: 'transfer', contract: '0xUniswap' })).toThrow(
      'Action "transfer" not in allowedActions'
    )
  })

  it('should throw for contract not in allowedContracts', () => {
    const clearance = createClearance(baseOptions)
    expect(() => clearance.validate({ action: 'swap', contract: '0xAave' })).toThrow(
      'Contract "0xAave" not in allowedContracts'
    )
  })

  it('should check action before contract (action error takes priority)', () => {
    const clearance = createClearance(baseOptions)
    expect(() => clearance.validate({ action: 'borrow', contract: '0xAave' })).toThrow(
      'Action "borrow" not in allowedActions'
    )
  })

  describe('case-insensitive contract matching', () => {
    it('should accept allowedContract with different casing', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({ action: 'swap', contract: '0XUNISWAP' })
      ).not.toThrow()
    })

    it('should accept lowercase version of allowed contract', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({ action: 'swap', contract: '0xuniswap' })
      ).not.toThrow()
    })
  })

  describe('spendLimit enforcement', () => {
    it('should pass when spend is within limit', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: 500_000_000_000_000_000n }, // 0.5 ETH
        })
      ).not.toThrow()
    })

    it('should pass when spend equals the limit exactly', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: 1_000_000_000_000_000_000n }, // exactly 1 ETH
        })
      ).not.toThrow()
    })

    it('should throw when spend exceeds the limit', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: 2_000_000_000_000_000_000n }, // 2 ETH
        })
      ).toThrow('Cumulative spend of 2000000000000000000 for "ETH" exceeds limit 1000000000000000000')
    })

    it('should throw when cumulative spend across calls exceeds the limit', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: 600_000_000_000_000_000n }, // 0.6 ETH — OK
        })
      ).not.toThrow()
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: 600_000_000_000_000_000n }, // 0.6 ETH — cumulative 1.2 ETH
        })
      ).toThrow('Cumulative spend of 1200000000000000000 for "ETH" exceeds limit 1000000000000000000')
    })

    it('should throw for negative spend amount', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: -1n },
        })
      ).toThrow('Spend amount must be non-negative, got -1')
    })

    it('should not restrict spend for tokens not in spendLimit', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'USDC', amount: 999_999_999n }, // USDC not in spendLimit
        })
      ).not.toThrow()
    })

    it('should enforce limit case-insensitively (eth and ETH share the same budget)', () => {
      const clearance = createClearance(baseOptions) // spendLimit: { ETH: 1 ETH }
      // First call with lowercase 'eth' — 0.6 ETH
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'eth', amount: 600_000_000_000_000_000n },
        })
      ).not.toThrow()
      // Second call with uppercase 'ETH' — same budget, cumulative 1.2 ETH → should fail
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: 600_000_000_000_000_000n },
        })
      ).toThrow('Cumulative spend of 1200000000000000000 for "ETH" exceeds limit 1000000000000000000')
    })

    it('should track unlimited tokens in spentAmounts for audit purposes', () => {
      const clearance = createClearance(baseOptions) // USDC has no limit
      clearance.validate({
        action: 'swap',
        contract: '0xUniswap',
        spend: { token: 'USDC', amount: 5_000_000n },
      })
      // USDC spend should be tracked even without a limit
      expect(clearance.spentAmounts['USDC']).toBe(5_000_000n)
    })
  })

  describe('expiry', () => {
    it('should not be expired immediately after creation', () => {
      const clearance = createClearance(baseOptions)
      expect(clearance.isExpired()).toBe(false)
    })

    it('should be expired when expiry is 0 seconds', () => {
      let fakeNow = 1_000_000
      const now = () => fakeNow
      const clearance = createClearance(
        { ...baseOptions, permissions: { ...baseOptions.permissions, expiry: 0 } },
        { now }
      )
      // createdAt = 1_000_000, expiry = 0 → expires at >= 1_000_000
      expect(clearance.isExpired()).toBe(true)
    })

    it('should not be expired when within expiry window', () => {
      let fakeNow = 1_000_000
      const now = () => fakeNow
      const clearance = createClearance(
        { ...baseOptions, permissions: { ...baseOptions.permissions, expiry: 7200 } }, // 2h window
        { now }
      )
      fakeNow = 1_000_000 + 3_600_000 // 1h later
      expect(clearance.isExpired()).toBe(false) // 1h elapsed, 2h window — not expired
    })

    it('should be expired after expiry window passes', () => {
      let fakeNow = 1_000_000
      const now = () => fakeNow
      const clearance = createClearance(
        { ...baseOptions, permissions: { ...baseOptions.permissions, expiry: 86400 } }, // 24h window
        { now }
      )
      fakeNow = 1_000_000 + 90_000_000 // 25h later
      expect(clearance.isExpired()).toBe(true)
    })

    it('should throw when validate() is called on an expired clearance', () => {
      let fakeNow = 1_000_000
      const now = () => fakeNow
      const clearance = createClearance(
        { ...baseOptions, permissions: { ...baseOptions.permissions, expiry: 3600 } }, // 1h
        { now }
      )
      fakeNow = 1_000_000 + 7_200_000 // 2h later — expired
      expect(() =>
        clearance.validate({ action: 'swap', contract: '0xUniswap' })
      ).toThrow('Clearance for agent "0xagent" has expired')
    })

    it('should throw when check() is called on an expired clearance', () => {
      let fakeNow = 1_000_000
      const now = () => fakeNow
      const clearance = createClearance(
        { ...baseOptions, permissions: { ...baseOptions.permissions, expiry: 3600 } }, // 1h
        { now }
      )
      fakeNow = 1_000_000 + 7_200_000 // 2h later — expired
      expect(() =>
        clearance.check({ action: 'swap', contract: '0xUniswap' })
      ).toThrow('Clearance for agent "0xagent" has expired')
    })
  })

  describe('check() — pure read-only validation', () => {
    it('should pass for a valid call without accumulating spend', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.check({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: 500_000_000_000_000_000n },
        })
      ).not.toThrow()
      // spentAmounts should remain zero — check() is pure
      expect(clearance.spentAmounts['ETH']).toBeUndefined()
    })

    it('should throw for disallowed action without side effects', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.check({ action: 'transfer', contract: '0xUniswap' })
      ).toThrow('Action "transfer" not in allowedActions')
      expect(clearance.spentAmounts['ETH']).toBeUndefined()
    })

    it('should throw when spend would exceed limit (without accumulating)', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.check({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: 2_000_000_000_000_000_000n },
        })
      ).toThrow('Cumulative spend of 2000000000000000000 for "ETH" exceeds limit 1000000000000000000')
      expect(clearance.spentAmounts['ETH']).toBeUndefined()
    })
  })

  describe('check() vs validate() isolation at budget boundary', () => {
    it('check() at near-limit does not consume budget, subsequent validate() still has full remaining headroom', () => {
      const clearance = createClearance(baseOptions) // ETH limit: 1 ETH
      const halfEth = 500_000_000_000_000_000n

      // Spend 0.5 ETH via validate()
      clearance.validate({
        action: 'swap',
        contract: '0xUniswap',
        spend: { token: 'ETH', amount: halfEth },
      })
      expect(clearance.spentAmounts['ETH']).toBe(halfEth)

      // check() another 0.5 ETH — should pass (total would be exactly 1 ETH) but NOT accumulate
      expect(() =>
        clearance.check({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: halfEth },
        })
      ).not.toThrow()

      // spentAmounts must still be 0.5 ETH — check() must not have accumulated
      expect(clearance.spentAmounts['ETH']).toBe(halfEth)

      // validate() the same 0.5 ETH — still within limit, should pass
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: halfEth },
        })
      ).not.toThrow()

      // Now at exactly 1 ETH — any further spend must fail
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: 1n },
        })
      ).toThrow('exceeds limit')
    })
  })

  describe('spentAmounts', () => {
    it('should reflect cumulative spend after validate() calls', () => {
      const clearance = createClearance(baseOptions)
      clearance.validate({
        action: 'swap',
        contract: '0xUniswap',
        spend: { token: 'ETH', amount: 300_000_000_000_000_000n }, // 0.3 ETH
      })
      expect(clearance.spentAmounts['ETH']).toBe(300_000_000_000_000_000n)
    })

    it('should not change after check() calls', () => {
      const clearance = createClearance(baseOptions)
      clearance.check({
        action: 'swap',
        contract: '0xUniswap',
        spend: { token: 'ETH', amount: 300_000_000_000_000_000n },
      })
      expect(clearance.spentAmounts['ETH']).toBeUndefined()
    })
  })

  it('should support multiple allowed contracts and actions', () => {
    const clearance = createClearance({
      agent: '0xagent',
      permissions: {
        allowedContracts: ['0xUniswap', '0xAave', '0xCurve'],
        allowedActions: ['swap', 'addLiquidity', 'borrow'],
        spendLimit: { ETH: 5_000_000_000_000_000_000n, USDC: 10_000n },
        expiry: 3600,
      },
    })
    expect(() => clearance.validate({ action: 'borrow', contract: '0xAave' })).not.toThrow()
    expect(() => clearance.validate({ action: 'addLiquidity', contract: '0xCurve' })).not.toThrow()
  })
})
