import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { assertOnChainTool, assertOnChainSchema } from '../tools/assert.js'
import { addSession, removeSession, setCachedClient } from '../state.js'

const SESSION_ID = 'test-assert-session'
// mock getBalance default = 1 ETH (set in beforeEach)
const ONE_ETH_WEI = '1000000000000000000'
const TWO_ETH_WEI = '2000000000000000000'

const mockClient = {
  getBalance: vi.fn().mockResolvedValue(1_000_000_000_000_000_000n), // 1 ETH
  getCode: vi.fn().mockResolvedValue('0x6080604052'),
  getStorageAt: vi.fn().mockResolvedValue('0x0000000000000000000000000000000000000000000000000000000000000001'),
}

beforeEach(() => {
  mockClient.getBalance.mockResolvedValue(1_000_000_000_000_000_000n)
  mockClient.getCode.mockResolvedValue('0x6080604052')
  mockClient.getStorageAt.mockResolvedValue('0x0000000000000000000000000000000000000000000000000000000000000001')
  addSession({
    id: SESSION_ID,
    rpcUrl: 'http://127.0.0.1:54321',
    forkUrl: 'https://eth-mainnet.example.com',
    blockNumber: 19_000_000n,
    chainId: 1,
    createdAt: new Date(),
    stop: vi.fn().mockResolvedValue(undefined),
  })
  setCachedClient(SESSION_ID, mockClient)
})

afterEach(() => {
  removeSession(SESSION_ID)
  vi.clearAllMocks()
})

describe('assert_on_chain tool', () => {
  it('should exist and have correct name', () => {
    expect(assertOnChainTool.name).toBe('assert_on_chain')
  })

  it('should return passed: true when balance gte assertion succeeds', async () => {
    const result = await assertOnChainTool.handler({
      sessionId: SESSION_ID,
      assertions: [
        {
          type: 'balance',
          address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          gte: ONE_ETH_WEI,
        },
      ],
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.passed).toBe(true)
    expect(data.results).toHaveLength(1)
    expect(data.results[0].passed).toBe(true)
  })

  it('should return passed: false when balance gte assertion fails', async () => {
    const result = await assertOnChainTool.handler({
      sessionId: SESSION_ID,
      assertions: [
        {
          type: 'balance',
          address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          gte: '9999000000000000000000',
        },
      ],
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.passed).toBe(false)
    expect(data.results[0].passed).toBe(false)
    expect(data.results[0].reason).toMatch(/balance/)
  })

  it('should return isError when session not found', async () => {
    const result = await assertOnChainTool.handler({
      sessionId: 'nonexistent-session',
      assertions: [
        { type: 'balance', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', gte: '0' },
      ],
    })
    expect(result.isError).toBe(true)
  })

  it('should return passed: true for hasCode when code exists', async () => {
    const result = await assertOnChainTool.handler({
      sessionId: SESSION_ID,
      assertions: [
        {
          type: 'hasCode',
          address: '0x1234567890abcdef1234567890abcdef12345678',
        },
      ],
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.results[0].passed).toBe(true)
  })

  it('should return passed: false for hasCode when no code exists', async () => {
    mockClient.getCode.mockResolvedValueOnce('0x')
    const result = await assertOnChainTool.handler({
      sessionId: SESSION_ID,
      assertions: [
        { type: 'hasCode', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
      ],
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.results[0].passed).toBe(false)
  })

  it('should return passed: true for matching storageSlot', async () => {
    const result = await assertOnChainTool.handler({
      sessionId: SESSION_ID,
      assertions: [
        {
          type: 'storageSlot',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          slot: '0x0',
          eq: '0x0000000000000000000000000000000000000000000000000000000000000001',
        },
      ],
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.results[0].passed).toBe(true)
  })

  it('should return passed: false for non-matching storageSlot', async () => {
    mockClient.getStorageAt.mockResolvedValueOnce('0x0000000000000000000000000000000000000000000000000000000000000002')
    const result = await assertOnChainTool.handler({
      sessionId: SESSION_ID,
      assertions: [
        {
          type: 'storageSlot',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          slot: '0x0',
          eq: '0x0000000000000000000000000000000000000000000000000000000000000001',
        },
      ],
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.results[0].passed).toBe(false)
  })

  it('should return passed: true when balance eq assertion matches exactly', async () => {
    const result = await assertOnChainTool.handler({
      sessionId: SESSION_ID,
      assertions: [
        {
          type: 'balance',
          address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          eq: ONE_ETH_WEI,
        },
      ],
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.passed).toBe(true)
    expect(data.results[0].passed).toBe(true)
  })

  it('should return passed: false when balance eq assertion does not match', async () => {
    // mock returns 1 ETH; eq expects 2 ETH → should fail
    const result = await assertOnChainTool.handler({
      sessionId: SESSION_ID,
      assertions: [
        {
          type: 'balance',
          address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          eq: TWO_ETH_WEI,
        },
      ],
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.passed).toBe(false)
    expect(data.results[0].reason).toMatch(/balance/)
  })

  it('should reject balance assertion with neither gte nor eq', () => {
    const result = assertOnChainSchema.safeParse({
      sessionId: SESSION_ID,
      assertions: [{ type: 'balance', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }],
    })
    expect(result.success).toBe(false)
  })

  it('should return passed: false when any assertion in a batch fails', async () => {
    mockClient.getCode.mockResolvedValueOnce('0x') // no code
    const result = await assertOnChainTool.handler({
      sessionId: SESSION_ID,
      assertions: [
        { type: 'balance', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', gte: '1000000000000000000' }, // passes
        { type: 'hasCode', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }, // fails (no code)
      ],
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.passed).toBe(false)
    expect(data.results).toHaveLength(2)
    expect(data.results[0].passed).toBe(true)
    expect(data.results[1].passed).toBe(false)
  })

  it('should handle storageSlot when getStorageAt returns undefined', async () => {
    mockClient.getStorageAt.mockResolvedValueOnce(undefined)
    const result = await assertOnChainTool.handler({
      sessionId: SESSION_ID,
      assertions: [
        {
          type: 'storageSlot',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          slot: '0x0',
          eq: '0x0000000000000000000000000000000000000000000000000000000000000001',
        },
      ],
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.results[0].passed).toBe(false) // '0x0' !== expected
  })
})
