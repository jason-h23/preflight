import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClearancePolicy } from '../types.js'
import { parseToolResult } from './test-helpers.js'

let mockPolicy: ClearancePolicy | null = null
vi.mock('../state.js', () => ({
  getPolicy: vi.fn(() => mockPolicy),
  setPolicy: vi.fn((p: ClearancePolicy) => { mockPolicy = p }),
  getSession: vi.fn(),
  addSession: vi.fn(),
  removeSession: vi.fn(),
  getAllSessions: vi.fn(() => new Map()),
  getCachedClient: vi.fn(() => undefined),
  setCachedClient: vi.fn(),
  clearCachedClient: vi.fn(),
}))

import { checkClearanceTool } from '../tools/clearance.js'
import { setPolicy } from '../state.js'

describe('check_clearance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPolicy = null
  })

  it('returns allowed: false with reason "no policy" when no policy is set', async () => {
    const result = await checkClearanceTool.handler({ token: 'native', amount: '1000000000000000000' })
    const data = parseToolResult(result)
    expect(data.allowed).toBe(false)
    expect(data.reason).toBe('no policy')
  })

  it('sets policy when provided inline and returns clearance result', async () => {
    const result = await checkClearanceTool.handler({
      token: 'native',
      amount: '1000000000000000000',
      policy: { maxAmount: '5000000000000000000', token: 'native' },
    })
    expect(parseToolResult(result).allowed).toBe(true)
  })

  it('returns allowed: true when amount is within limit', async () => {
    mockPolicy = {
      maxAmount: 2000000000000000000n,
      token: 'native',
      spentAmounts: new Map<string, bigint>(),
    }
    const result = await checkClearanceTool.handler({ token: 'native', amount: '1000000000000000000' })
    const data = parseToolResult(result)
    expect(data.allowed).toBe(true)
    expect(data.remaining).toBeDefined()
  })

  it('returns allowed: false when amount exceeds maxAmount', async () => {
    mockPolicy = {
      maxAmount: 1000000000000000000n,
      token: 'native',
      spentAmounts: new Map<string, bigint>(),
    }
    const result = await checkClearanceTool.handler({ token: 'native', amount: '2000000000000000000' })
    const data = parseToolResult(result)
    expect(data.allowed).toBe(false)
    expect(data.reason).toBe('exceeds limit')
  })

  it('tracks cumulative spend across consecutive calls', async () => {
    mockPolicy = {
      maxAmount: 2000000000000000000n, // 2 ETH
      token: 'native',
      spentAmounts: new Map<string, bigint>(),
    }

    // First call: 1.5 ETH → allowed, records spend
    const result1 = await checkClearanceTool.handler({ token: 'native', amount: '1500000000000000000' })
    expect(parseToolResult(result1).allowed).toBe(true)

    // Second call: 1 ETH → would total 2.5 ETH, exceeds 2 ETH limit
    const result2 = await checkClearanceTool.handler({ token: 'native', amount: '1000000000000000000' })
    const data2 = parseToolResult(result2)
    expect(data2.allowed).toBe(false)
    expect(data2.reason).toBe('exceeds limit')
  })

  it('returns allowed: false with reason "expired" when policy has expired', async () => {
    mockPolicy = {
      maxAmount: 10000000000000000000n,
      token: 'native',
      expiresAt: Math.floor(Date.now() / 1000) - 3600,
      spentAmounts: new Map<string, bigint>(),
    }
    const result = await checkClearanceTool.handler({ token: 'native', amount: '1000000000000000000' })
    const data = parseToolResult(result)
    expect(data.allowed).toBe(false)
    expect(data.reason).toBe('expired')
  })

  it('calculates remaining correctly when allowed', async () => {
    mockPolicy = {
      maxAmount: 5000000000000000000n, // 5 ETH
      token: 'native',
      spentAmounts: new Map<string, bigint>([['NATIVE', 2000000000000000000n]]), // 2 ETH pre-spent
    }
    const result = await checkClearanceTool.handler({ token: 'native', amount: '1000000000000000000' })
    const data = parseToolResult(result)
    expect(data.allowed).toBe(true)
    // remaining after spend = (5 - 2) - 1 = 2 ETH
    expect(data.remaining).toBe('2000000000000000000')
  })

  it('returns allowed: false with reason "recipient not allowed" for wrong recipient', async () => {
    mockPolicy = {
      maxAmount: 5000000000000000000n,
      token: 'native',
      recipient: '0xSafeAddress',
      spentAmounts: new Map<string, bigint>(),
    }
    const result = await checkClearanceTool.handler({
      token: 'native',
      amount: '1000000000000000000',
      recipient: '0xUnsafeAddress',
    })
    const data = parseToolResult(result)
    expect(data.allowed).toBe(false)
    expect(data.reason).toBe('recipient not allowed')
  })

  it('preserves spentAmounts when inline policy updates the same token', async () => {
    const initialSpent = 3000000000000000000n // 3 ETH already spent
    mockPolicy = {
      maxAmount: 5000000000000000000n,
      token: 'native',
      spentAmounts: new Map<string, bigint>([['NATIVE', initialSpent]]),
    }

    // Update policy inline (same token, raise limit) — spend history must carry over
    await checkClearanceTool.handler({
      token: 'native',
      amount: '500000000000000000', // 0.5 ETH → allowed, records on top of existing 3 ETH
      policy: { maxAmount: '10000000000000000000', token: 'native' },
    })

    const calledWith = vi.mocked(setPolicy).mock.calls[0][0]
    // spentAmounts should reflect preserved 3 ETH + recorded 0.5 ETH = 3.5 ETH
    expect(calledWith.spentAmounts.get('NATIVE')).toBe(initialSpent + 500000000000000000n)
  })

  it('resets spentAmounts when inline policy uses a different token', async () => {
    mockPolicy = {
      maxAmount: 5000000000000000000n,
      token: 'native',
      spentAmounts: new Map<string, bigint>([['NATIVE', 3000000000000000000n]]),
    }

    await checkClearanceTool.handler({
      token: '0xusdc',
      amount: '1000000',
      policy: { maxAmount: '100000000', token: '0xusdc' },
    })

    const calledWith = vi.mocked(setPolicy).mock.calls[0][0]
    // NATIVE spend should NOT carry over to a different token policy
    expect(calledWith.spentAmounts.has('NATIVE')).toBe(false)
    expect(calledWith.spentAmounts.get('0XUSDC')).toBe(1000000n)
  })

  it('handler rejects decimal amount at Zod schema level', () => {
    expect(checkClearanceTool.schema.safeParse({ token: 'native', amount: '1.5' }).success).toBe(false)
  })

  it('handler called directly with decimal amount returns toolError without crashing', async () => {
    mockPolicy = {
      maxAmount: 5000000000000000000n,
      token: 'native',
      spentAmounts: new Map<string, bigint>(),
    }
    // Simulates MCP SDK bypassing Zod and calling handler directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkClearanceTool.handler({ token: 'native', amount: '1.5' } as any)
    // Should not throw — the handler must not crash the MCP server process
    expect(result).toBeDefined()
  })

  it('preserves spentAmounts when token casing differs (native vs NATIVE)', async () => {
    const initialSpent = 2000000000000000000n // 2 ETH spent under 'native'
    mockPolicy = {
      maxAmount: 5000000000000000000n,
      token: 'native',
      spentAmounts: new Map<string, bigint>([['NATIVE', initialSpent]]),
    }

    // Update policy with same logical token but different casing — history must carry over
    await checkClearanceTool.handler({
      token: 'NATIVE',
      amount: '500000000000000000', // 0.5 ETH
      policy: { maxAmount: '10000000000000000000', token: 'NATIVE' },
    })

    const calledWith = vi.mocked(setPolicy).mock.calls[0][0]
    expect(calledWith.spentAmounts.get('NATIVE')).toBe(initialSpent + 500000000000000000n)
  })

  it('validates Zod schema rejects missing amount', () => {
    expect(checkClearanceTool.schema.safeParse({ token: 'native' }).success).toBe(false)
  })

  it('validates Zod schema rejects missing token', () => {
    expect(checkClearanceTool.schema.safeParse({ amount: '1000' }).success).toBe(false)
  })
})
