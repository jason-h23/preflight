/**
 * Integration tests — real Anvil processes
 *
 * Strategy: start a plain local Ethereum node (no external RPC needed),
 * then run the MCP tools against it. Each fork and simulate call
 * spins up a real Anvil child process.
 *
 * Timeouts are generous (30s per test) because Anvil startup can be slow
 * on a busy CI machine.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createAnvil, type Anvil } from '@viem/anvil'
import { parseToolResult } from './test-helpers.js'
import { createForkTool, resetForkTool } from '../tools/fork.js'
import { simulateTransactionTool } from '../tools/simulate.js'
import { getAllSessions, removeSession, clearPolicy } from '../state.js'

// Well-known Anvil funded addresses (index 0 and 1 of the default mnemonic)
const SENDER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const RECEIVER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

const ONE_ETH = '1000000000000000000'

const TEST_TIMEOUT = 30_000
const ANVIL_START_TIMEOUT = 20_000

let sourceAnvil: Anvil
let sourceRpcUrl: string

beforeAll(async () => {
  // Start a plain local Ethereum chain (no fork — just a local EVM)
  // This serves as the "source chain" for our fork operations
  sourceAnvil = createAnvil({
    // No forkUrl → starts a fresh local chain with pre-funded accounts
    startTimeout: ANVIL_START_TIMEOUT,
  })
  await sourceAnvil.start()
  sourceRpcUrl = `http://${sourceAnvil.host}:${sourceAnvil.port}`
  process.env.PREFLIGHT_FORK_URL = sourceRpcUrl
}, TEST_TIMEOUT)

afterAll(async () => {
  // Stop the source chain (all MCP sessions already cleaned up per-test)
  await sourceAnvil.stop().catch(() => undefined)
  delete process.env.PREFLIGHT_FORK_URL
})

afterEach(async () => {
  // Stop and remove all active MCP sessions so MAX_SESSIONS never fills up
  const sessions = getAllSessions()
  await Promise.allSettled(
    [...sessions.values()].map(async (s) => {
      await s.stop().catch(() => undefined)
      removeSession(s.id)
    }),
  )
  clearPolicy()
})

describe('create_fork (integration)', () => {
  it('creates a real Anvil session and returns valid metadata', async () => {
    const result = await createForkTool.handler({ forkUrl: sourceRpcUrl })

    expect(result.isError).toBeUndefined()
    const data = parseToolResult(result)
    expect(data.sessionId).toBeDefined()
    expect(data.rpcUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(typeof data.blockNumber).toBe('string')
    expect(new Date(data.createdAt).getTime()).not.toBeNaN()

  }, TEST_TIMEOUT)

  it('reads the correct block number from the forked chain', async () => {
    const result = await createForkTool.handler({
      forkUrl: sourceRpcUrl,
      blockNumber: '0',
    })

    expect(result.isError).toBeUndefined()
    const data = parseToolResult(result)
    expect(data.blockNumber).toBe('0')
  }, TEST_TIMEOUT)

  it('returns error when fork URL is unreachable', async () => {
    const result = await createForkTool.handler({
      forkUrl: 'http://127.0.0.1:1', // nothing listening here
    })
    expect(result.isError).toBe(true)
    expect(parseToolResult(result).error).toMatch(/Failed to create fork/)
  }, TEST_TIMEOUT)
})

describe('simulate_transaction (integration)', () => {
  it('auto-creates fork and simulates ETH transfer with correct balance changes', async () => {
    const result = await simulateTransactionTool.handler({
      from: SENDER,
      to: RECEIVER,
      value: ONE_ETH,
    })

    expect(result.isError).toBeUndefined()
    const data = parseToolResult(result)
    expect(data.success).toBe(true)
    expect(data.sessionId).toBeDefined()
    expect(data.autoCreatedSessionId).toBe(data.sessionId)
    expect(data.balanceChanges[SENDER]).toBe(`-${ONE_ETH}`)
    expect(data.balanceChanges[RECEIVER]).toBe(ONE_ETH)
    expect(Number(data.gasUsed)).toBeGreaterThan(0)
  }, TEST_TIMEOUT)

  it('uses existing sessionId instead of creating a new fork', async () => {
    // First create a fork
    const forkResult = await createForkTool.handler({ forkUrl: sourceRpcUrl })
    const { sessionId } = parseToolResult(forkResult)

    // Simulate against it
    const result = await simulateTransactionTool.handler({
      from: SENDER,
      to: RECEIVER,
      value: ONE_ETH,
      sessionId,
    })

    expect(result.isError).toBeUndefined()
    const data = parseToolResult(result)
    expect(data.sessionId).toBe(sessionId)
    expect(data.autoCreatedSessionId).toBeUndefined()
  }, TEST_TIMEOUT)

  it('reports revert when sender has insufficient balance', async () => {
    const result = await simulateTransactionTool.handler({
      from: '0x0000000000000000000000000000000000000001', // address with zero ETH balance
      to: RECEIVER,
      value: ONE_ETH,
    })

    const data = parseToolResult(result)
    if (result.isError) {
      // Anvil tool-level error is acceptable evidence of failed send
      expect(data.error).toBeDefined()
    } else {
      expect(data.success).toBe(false)
      expect(data.revertReason).toBeDefined()
    }
  }, TEST_TIMEOUT)
})

describe('reset_fork (integration)', () => {
  it('resets a session to the original block and returns a new sessionId', async () => {
    const forkResult = await createForkTool.handler({ forkUrl: sourceRpcUrl })
    const { sessionId: originalId, blockNumber: originalBlock } = parseToolResult(forkResult)

    const resetResult = await resetForkTool.handler({ sessionId: originalId })

    expect(resetResult.isError).toBeUndefined()
    const data = parseToolResult(resetResult)
    expect(data.sessionId).toBeDefined()
    expect(data.sessionId).not.toBe(originalId)
    expect(data.previousSessionId).toBe(originalId)
    expect(data.blockNumber).toBe(originalBlock)
  }, TEST_TIMEOUT)
})
