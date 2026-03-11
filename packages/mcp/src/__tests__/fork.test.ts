import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseToolResult } from './test-helpers.js'

const mockStop = vi.fn(() => Promise.resolve())
const mockGetBlockNumber = vi.fn(() => Promise.resolve(21500000n))
const mockGetChainId = vi.fn(() => Promise.resolve(1))

vi.mock('@preflight/core', () => ({
  createFork: vi.fn(() =>
    Promise.resolve({
      rpcUrl: 'http://127.0.0.1:8545',
      client: {
        getBlockNumber: mockGetBlockNumber,
        getChainId: mockGetChainId,
      },
      stop: mockStop,
    })
  ),
}))

const mockSessions = new Map<string, unknown>()
vi.mock('../state.js', () => ({
  getSession: vi.fn((id: string) => mockSessions.get(id)),
  addSession: vi.fn((session: { id: string }) => {
    if (mockSessions.size >= 5) throw new Error('Max sessions (5) reached')
    mockSessions.set(session.id, session)
  }),
  removeSession: vi.fn((id: string) => mockSessions.delete(id)),
  getAllSessions: vi.fn(() => mockSessions),
  getCachedClient: vi.fn(() => undefined),
  setCachedClient: vi.fn(),
  clearCachedClient: vi.fn(),
}))

vi.mock('../tool-helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tool-helpers.js')>()
  return {
    ...actual,
    withTimeout: (p: Promise<unknown>) => p, // pass-through in tests
  }
})

import { createForkTool, resetForkTool } from '../tools/fork.js'
import { createFork } from '@preflight/core'

describe('create_fork', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessions.clear()
  })

  it('returns error when no forkUrl and PREFLIGHT_FORK_URL is unset', async () => {
    const originalEnv = process.env.PREFLIGHT_FORK_URL
    delete process.env.PREFLIGHT_FORK_URL

    const result = await createForkTool.handler({ forkUrl: '' })

    expect(result.isError).toBe(true)
    const data = parseToolResult(result)
    expect(data.error).toContain('No fork URL')

    process.env.PREFLIGHT_FORK_URL = originalEnv
  })

  it('creates a session and returns sessionId + rpcUrl', async () => {
    const result = await createForkTool.handler({
      forkUrl: 'https://eth-mainnet.example.com',
    })

    expect(result.isError).toBeUndefined()
    const data = parseToolResult(result)
    expect(data.sessionId).toBeDefined()
    expect(data.rpcUrl).toBe('http://127.0.0.1:8545')
    expect(data.blockNumber).toBe('21500000')
    expect(data.createdAt).toBeDefined()
    expect(createFork).toHaveBeenCalledWith({
      rpc: 'https://eth-mainnet.example.com',
      blockNumber: undefined,
    })
  })

  it('passes blockNumber as bigint to createFork', async () => {
    const result = await createForkTool.handler({
      forkUrl: 'https://eth-mainnet.example.com',
      blockNumber: '20000000',
    })

    expect(result.isError).toBeUndefined()
    expect(createFork).toHaveBeenCalledWith({
      rpc: 'https://eth-mainnet.example.com',
      blockNumber: 20000000n,
    })
  })

  it('returns error when max sessions exceeded', async () => {
    for (let i = 0; i < 5; i++) mockSessions.set(`sess-${i}`, { id: `sess-${i}` })

    const result = await createForkTool.handler({
      forkUrl: 'https://eth-mainnet.example.com',
    })

    expect(result.isError).toBe(true)
    const data = parseToolResult(result)
    expect(data.error).toContain('Max sessions')
  })

  it('validates schema rejects non-integer blockNumber (decimal)', () => {
    const result = createForkTool.schema.safeParse({
      forkUrl: 'https://eth-mainnet.example.com',
      blockNumber: '1.5',
    })
    expect(result.success).toBe(false)
  })

  it('returns error when createFork throws', async () => {
    vi.mocked(createFork).mockRejectedValueOnce(new Error('RPC unreachable'))

    const result = await createForkTool.handler({
      forkUrl: 'https://bad-rpc.example.com',
    })

    expect(result.isError).toBe(true)
    const data = parseToolResult(result)
    expect(data.error).toContain('RPC unreachable')
  })
})

describe('reset_fork', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessions.clear()
  })

  it('returns error for non-existent sessionId', async () => {
    const result = await resetForkTool.handler({ sessionId: 'nonexistent-session' })

    expect(result.isError).toBe(true)
    const data = parseToolResult(result)
    expect(data.error).toContain('Session not found')
    expect(data.error).toContain('nonexistent-session')
  })

  it('resets existing session and returns new sessionId + rpcUrl', async () => {
    const existingSession = {
      id: 'old-session-id',
      rpcUrl: 'http://127.0.0.1:9999',
      forkUrl: 'https://eth-mainnet.example.com',
      blockNumber: 21000000n,
      chainId: 1,
      createdAt: new Date(),
      stop: mockStop,
    }
    mockSessions.set('old-session-id', existingSession)

    const result = await resetForkTool.handler({ sessionId: 'old-session-id' })

    expect(result.isError).toBeUndefined()
    const data = parseToolResult(result)
    expect(data.sessionId).toBeDefined()
    expect(data.sessionId).not.toBe('old-session-id')
    expect(data.rpcUrl).toBe('http://127.0.0.1:8545')
    expect(data.previousSessionId).toBe('old-session-id')
    expect(mockStop).toHaveBeenCalled()
  })

  it('preserves session state when new fork creation fails during reset', async () => {
    vi.mocked(createFork).mockRejectedValueOnce(new Error('RPC unreachable'))

    const existingSession = {
      id: 'old-session-id',
      rpcUrl: 'http://127.0.0.1:9999',
      forkUrl: 'https://eth-mainnet.example.com',
      blockNumber: 21000000n,
      chainId: 1,
      createdAt: new Date(),
      stop: mockStop,
    }
    mockSessions.set('old-session-id', existingSession)

    const result = await resetForkTool.handler({ sessionId: 'old-session-id' })

    expect(result.isError).toBe(true)
    expect(mockSessions.has('old-session-id')).toBe(true)
  })

  it('validates sessionId is non-empty via Zod schema', () => {
    const result = resetForkTool.schema.safeParse({ sessionId: '' })
    expect(result.success).toBe(false)
  })
})
