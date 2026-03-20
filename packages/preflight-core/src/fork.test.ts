import { describe, it, expect, afterEach } from 'vitest'
import { createFork } from './fork'

/** Use FORK_RPC_URL env var, or skip the test suite if not set. */
const FORK_RPC = process.env.FORK_RPC_URL ?? 'https://eth.drpc.org'

/** Anvil default test account #0 */
const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const
const TEN_THOUSAND_ETH = 10_000_000_000_000_000_000_000n

describe('createFork', () => {
  let fork: Awaited<ReturnType<typeof createFork>> | undefined

  afterEach(async () => {
    await fork?.stop()
    fork = undefined
  }, 10_000)

  it('should start an Anvil fork and return a public client', async () => {
    fork = await createFork({ rpc: FORK_RPC })
    const blockNumber = await fork.client.getBlockNumber()
    expect(blockNumber).toBeGreaterThan(0n)
    expect(fork.rpcUrl).toMatch(/^http:\/\//)
    expect(fork.stop).toBeTypeOf('function')
  }, 60_000)

  it('should fork at a specific block number', async () => {
    fork = await createFork({
      rpc: FORK_RPC,
      blockNumber: 20_000_000n,
    })
    const blockNumber = await fork.client.getBlockNumber()
    expect(blockNumber).toBe(20_000_000n)
  }, 60_000)
})

describe('createFork — standalone mode', () => {
  let fork: Awaited<ReturnType<typeof createFork>> | undefined

  afterEach(async () => {
    await fork?.stop()
    fork = undefined
  }, 10_000)

  it('should start Anvil without forking when standalone is true', async () => {
    fork = await createFork({ standalone: true })
    expect(fork.rpcUrl).toMatch(/^http:\/\//)
    expect(fork.stop).toBeTypeOf('function')
  }, 30_000)

  it('should have test account with 10000 ETH balance', async () => {
    fork = await createFork({ standalone: true })
    const balance = await fork.client.getBalance({ address: TEST_ACCOUNT })
    expect(balance).toBe(TEN_THOUSAND_ETH)
  }, 30_000)

  it('should use foundry chain (chainId 31337) in standalone mode', async () => {
    fork = await createFork({ standalone: true })
    const chainId = await fork.client.getChainId()
    expect(chainId).toBe(31337)
  }, 30_000)

  it('should throw when rpc is empty string in fork mode', async () => {
    await expect(
      createFork({ rpc: '' })
    ).rejects.toThrow(/rpc is required/)
  })

  it('should throw when rpc is whitespace-only in fork mode', async () => {
    await expect(
      createFork({ rpc: '   ' })
    ).rejects.toThrow(/rpc is required/)
  })
})
