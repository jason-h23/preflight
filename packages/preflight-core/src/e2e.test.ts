/**
 * Anvil Standalone E2E Tests
 *
 * Full flow E2E using Anvil standalone mode (no external RPC required).
 * Tests: createFork(standalone) → scenario → clearance → real tx → assertOnChain
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createPublicClient, createWalletClient, http, parseEther } from 'viem'
import { foundry } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { createFork } from './fork'
import { preflight } from './scenario'
import { assertOnChain } from './assert'
import type { AssertContext } from './assert'
import { createClearance } from '@clearance/core'

/** Anvil default test account #0 */
const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
/** Anvil default test account #1 */
const RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const
const TEN_THOUSAND_ETH = 10_000_000_000_000_000_000_000n
const ONE_ETH = 1_000_000_000_000_000_000n

describe('E2E: Fork standalone basics', () => {
  let fork: Awaited<ReturnType<typeof createFork>> | undefined

  afterEach(async () => {
    await fork?.stop()
    fork = undefined
  }, 10_000)

  it('should start standalone Anvil and return a working client', async () => {
    fork = await createFork({ standalone: true })
    const blockNumber = await fork.client.getBlockNumber()
    expect(blockNumber).toBeGreaterThanOrEqual(0n)
    expect(fork.rpcUrl).toMatch(/^http:\/\//)
  }, 30_000)

  it('should have test accounts with default ETH balance', async () => {
    fork = await createFork({ standalone: true })
    const balance = await fork.client.getBalance({ address: TEST_ACCOUNT })
    expect(balance).toBe(TEN_THOUSAND_ETH)
  }, 30_000)

  it('should stop cleanly and reject subsequent requests', async () => {
    // Use local variable to avoid afterEach double-stop
    const f = await createFork({ standalone: true })
    const rpcUrl = f.rpcUrl
    await f.stop()

    const deadClient = createPublicClient({
      chain: foundry,
      transport: http(rpcUrl, { timeout: 2_000, retryCount: 0 }),
    })
    await expect(deadClient.getBlockNumber()).rejects.toThrow()
  }, 30_000)
})

describe('E2E: Scenario + standalone fork', () => {
  it('should run a scenario callback with standalone fork context', async () => {
    const s = preflight.scenario('standalone e2e', {
      fork: { standalone: true },
    })

    let capturedBalance: bigint | null = null
    await s.run(async (ctx) => {
      capturedBalance = await ctx.fork.client.getBalance({
        address: TEST_ACCOUNT,
      })
    })

    expect(capturedBalance).toBe(TEN_THOUSAND_ETH)
  }, 30_000)

  it('should clean up Anvil after scenario completes', async () => {
    const s = preflight.scenario('cleanup e2e', {
      fork: { standalone: true },
    })

    let rpcUrl: string | null = null
    await s.run(async (ctx) => {
      rpcUrl = ctx.fork.rpcUrl
    })

    expect(rpcUrl).not.toBeNull()
    const deadClient = createPublicClient({
      chain: foundry,
      transport: http(rpcUrl!, { timeout: 2_000, retryCount: 0 }),
    })
    await expect(deadClient.getBlockNumber()).rejects.toThrow()
  }, 30_000)
})

describe('E2E: Full flow — clearance → transfer → assert', () => {
  let fork: Awaited<ReturnType<typeof createFork>> | undefined

  afterEach(async () => {
    await fork?.stop()
    fork = undefined
  }, 10_000)

  it('should execute a clearance-guarded transfer and verify on-chain state', async () => {
    fork = await createFork({ standalone: true })
    const account = privateKeyToAccount(TEST_PRIVATE_KEY)
    const wallet = createWalletClient({
      account,
      chain: foundry,
      transport: http(fork.rpcUrl),
    })

    // Step 1: Read state before
    const balanceBefore = await fork.client.getBalance({ address: TEST_ACCOUNT })
    const blockBefore = await fork.client.getBlockNumber()

    // Step 2: Clearance validates the call
    const clearance = createClearance({
      agent: 'e2e-agent',
      permissions: {
        allowedContracts: [RECIPIENT],
        allowedActions: ['transfer'],
        spendLimit: { ETH: parseEther('5') },
        expiry: 3600,
      },
    })
    clearance.validate({
      action: 'transfer',
      contract: RECIPIENT,
      spend: { token: 'ETH', amount: ONE_ETH },
    })

    // Step 3: Send real ETH transfer on standalone Anvil
    const hash = await wallet.sendTransaction({
      to: RECIPIENT,
      value: ONE_ETH,
    })
    const receipt = await fork.client.waitForTransactionReceipt({ hash })

    // Step 4: Read state after
    const balanceAfter = await fork.client.getBalance({ address: TEST_ACCOUNT })

    // Step 5: Assert on-chain state from real Anvil reads
    const ctx: AssertContext = {
      snapshots: {
        before: { balances: { [TEST_ACCOUNT]: { ETH: balanceBefore } }, blockNumber: blockBefore },
        after: { balances: { [TEST_ACCOUNT]: { ETH: balanceAfter } }, blockNumber: receipt.blockNumber },
      },
      gasUsed: receipt.gasUsed,
      approvals: [],
    }

    assertOnChain(ctx)
      .balanceDecreased('ETH', { address: TEST_ACCOUNT, min: ONE_ETH })
      .gasUsed({ max: 100_000n })
      .noUnexpectedApprovals()

    // Verify clearance tracked the spend
    expect(clearance.spentAmounts['ETH']).toBe(ONE_ETH)
  }, 30_000)

  it('should reject transfer when clearance denies the action', async () => {
    fork = await createFork({ standalone: true })

    const clearance = createClearance({
      agent: 'e2e-agent',
      permissions: {
        allowedContracts: [RECIPIENT],
        allowedActions: ['swap'], // 'transfer' not allowed
        spendLimit: { ETH: parseEther('5') },
        expiry: 3600,
      },
    })

    expect(() =>
      clearance.validate({
        action: 'transfer',
        contract: RECIPIENT,
        spend: { token: 'ETH', amount: ONE_ETH },
      })
    ).toThrow()
  }, 30_000)

  it('should detect unexpected balance change via assertOnChain', async () => {
    fork = await createFork({ standalone: true })
    const account = privateKeyToAccount(TEST_PRIVATE_KEY)
    const wallet = createWalletClient({
      account,
      chain: foundry,
      transport: http(fork.rpcUrl),
    })

    const balanceBefore = await fork.client.getBalance({ address: TEST_ACCOUNT })
    const blockBefore = await fork.client.getBlockNumber()

    // Send 2 ETH
    const hash = await wallet.sendTransaction({
      to: RECIPIENT,
      value: parseEther('2'),
    })
    const receipt = await fork.client.waitForTransactionReceipt({ hash })
    const balanceAfter = await fork.client.getBalance({ address: TEST_ACCOUNT })

    const ctx: AssertContext = {
      snapshots: {
        before: { balances: { [TEST_ACCOUNT]: { ETH: balanceBefore } }, blockNumber: blockBefore },
        after: { balances: { [TEST_ACCOUNT]: { ETH: balanceAfter } }, blockNumber: receipt.blockNumber },
      },
      gasUsed: receipt.gasUsed,
      approvals: [],
    }

    // min: 1 ETH, actual: ~2 ETH + gas — should pass
    assertOnChain(ctx)
      .balanceDecreased('ETH', { address: TEST_ACCOUNT, min: ONE_ETH })
      .gasUsed({ max: 100_000n })

    // min: 5 ETH, actual: ~2 ETH — should fail
    expect(() =>
      assertOnChain(ctx)
        .balanceDecreased('ETH', { address: TEST_ACCOUNT, min: parseEther('5') })
    ).toThrow()
  }, 30_000)
})
