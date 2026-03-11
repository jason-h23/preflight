import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseToolResult } from './test-helpers.js'

const {
  mockStop,
  mockGetBlockNumber,
  mockGetChainId,
  mockCall,
  mockEstimateGas,
  mockCreateFork,
  mockSessions,
} = vi.hoisted(() => {
  const mockStop = vi.fn(() => Promise.resolve())
  const mockGetBlockNumber = vi.fn(() => Promise.resolve(21500000n))
  const mockGetChainId = vi.fn(() => Promise.resolve(1))
  const mockCall = vi.fn(() => Promise.resolve('0x'))
  const mockEstimateGas = vi.fn(() => Promise.resolve(145000n))
  const mockCreateFork = vi.fn(() =>
    Promise.resolve({
      rpcUrl: 'http://127.0.0.1:8545',
      client: {
        getBlockNumber: mockGetBlockNumber,
        getChainId: mockGetChainId,
        call: mockCall,
        estimateGas: mockEstimateGas,
      },
      stop: mockStop,
    })
  )
  const mockSessions = new Map<string, unknown>()
  return { mockStop, mockGetBlockNumber, mockGetChainId, mockCall, mockEstimateGas, mockCreateFork, mockSessions }
})

vi.mock('@preflight/core', () => ({
  createFork: mockCreateFork,
}))

vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({
    call: mockCall,
    estimateGas: mockEstimateGas,
  })),
  http: vi.fn(),
  defineChain: vi.fn((chain: unknown) => chain),
}))

vi.mock('../state.js', () => ({
  getSession: vi.fn((id: string) => mockSessions.get(id)),
  addSession: vi.fn((session: { id: string }) => {
    mockSessions.set(session.id, session)
  }),
  removeSession: vi.fn((id: string) => mockSessions.delete(id)),
  getAllSessions: vi.fn(() => mockSessions),
  getCachedClient: vi.fn(() => undefined),
  setCachedClient: vi.fn(),
  clearCachedClient: vi.fn(),
  getPolicy: vi.fn(() => null),
  setPolicy: vi.fn(),
}))

vi.mock('../tool-helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tool-helpers.js')>()
  return {
    ...actual,
    withTimeout: (p: Promise<unknown>) => p,
  }
})

import { simulateTransactionTool } from '../tools/simulate.js'

const VALID_FROM = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const VALID_TO = '0x1234567890abcdef1234567890abcdef12345678'

describe('simulate_transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessions.clear()
    mockCall.mockResolvedValue('0x')
    mockEstimateGas.mockResolvedValue(145000n)
    process.env.PREFLIGHT_FORK_URL = 'https://eth-mainnet.example.com'
  })

  it('auto-creates fork when no sessionId provided', async () => {
    const result = await simulateTransactionTool.handler({
      from: VALID_FROM,
      to: VALID_TO,
      value: '1000000000000000000',
    })

    expect(result.isError).toBeUndefined()
    const data = parseToolResult(result)
    expect(data.success).toBe(true)
    expect(data.sessionId).toBeDefined()
    expect(data.autoCreatedSessionId).toBeDefined()
    expect(mockCreateFork).toHaveBeenCalledWith({
      rpc: 'https://eth-mainnet.example.com',
    })
  })

  it('returns error when PREFLIGHT_FORK_URL is unset and no sessionId', async () => {
    delete process.env.PREFLIGHT_FORK_URL

    const result = await simulateTransactionTool.handler({ from: VALID_FROM, to: VALID_TO })

    expect(result.isError).toBe(true)
    expect(parseToolResult(result).error).toContain('PREFLIGHT_FORK_URL')
  })

  it('returns error for non-existent sessionId', async () => {
    const result = await simulateTransactionTool.handler({
      from: VALID_FROM,
      to: VALID_TO,
      sessionId: 'nonexistent',
    })

    expect(result.isError).toBe(true)
    expect(parseToolResult(result).error).toContain('nonexistent')
  })

  it('uses existing session when sessionId provided', async () => {
    const existingSession = {
      id: 'existing-session',
      rpcUrl: 'http://127.0.0.1:8545',
      forkUrl: 'https://eth-mainnet.example.com',
      blockNumber: 21000000n,
      chainId: 1,
      createdAt: new Date(),
      stop: mockStop,
    }
    mockSessions.set('existing-session', existingSession)

    const result = await simulateTransactionTool.handler({
      from: VALID_FROM,
      to: VALID_TO,
      sessionId: 'existing-session',
    })

    expect(result.isError).toBeUndefined()
    const data = parseToolResult(result)
    expect(data.sessionId).toBe('existing-session')
    expect(mockCreateFork).not.toHaveBeenCalled()
  })

  it('returns ETH balanceChanges for simple ETH transfer (no data)', async () => {
    const result = await simulateTransactionTool.handler({
      from: VALID_FROM,
      to: VALID_TO,
      value: '1000000000000000000',
    })

    expect(result.isError).toBeUndefined()
    const data = parseToolResult(result)
    expect(data.success).toBe(true)
    expect(data.balanceChanges[VALID_FROM]).toBe('-1000000000000000000')
    expect(data.balanceChanges[VALID_TO]).toBe('1000000000000000000')
  })

  it('returns empty balanceChanges for ERC-20 transfer (data provided)', async () => {
    const result = await simulateTransactionTool.handler({
      from: VALID_FROM,
      to: VALID_TO,
      value: '0',
      data: '0xa9059cbb0000000000000000000000001234567890abcdef1234567890abcdef123456780000000000000000000000000000000000000000000000000de0b6b3a7640000',
    })

    expect(result.isError).toBeUndefined()
    const data = parseToolResult(result)
    expect(data.success).toBe(true)
    expect(Object.keys(data.balanceChanges)).toHaveLength(0)
  })

  it('returns revert info when simulation call fails', async () => {
    mockCall.mockImplementationOnce(() => {
      throw new Error('execution reverted: ERC20: insufficient balance')
    })

    const result = await simulateTransactionTool.handler({
      from: VALID_FROM,
      to: VALID_TO,
      value: '0',
      data: '0xa9059cbb',
    })

    expect(result.isError).toBeUndefined()
    const data = parseToolResult(result)
    expect(data.success).toBe(false)
    expect(data.revertReason).toContain('ERC20: insufficient balance')
  })

  it('validates schema rejects non-integer value (decimal)', () => {
    expect(
      simulateTransactionTool.schema.safeParse({ from: VALID_FROM, to: VALID_TO, value: '1.5' }).success
    ).toBe(false)
  })

  it('validates schema rejects missing from address', () => {
    expect(simulateTransactionTool.schema.safeParse({ to: VALID_TO }).success).toBe(false)
  })

  it('validates schema rejects invalid hex address', () => {
    expect(
      simulateTransactionTool.schema.safeParse({ from: 'not-an-address', to: VALID_TO }).success
    ).toBe(false)
  })
})
