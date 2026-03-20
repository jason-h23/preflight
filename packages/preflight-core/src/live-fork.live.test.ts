/**
 * Live E2E tests for createLiveFork — requires real Sepolia RPC.
 *
 * Run with:
 *   SEPOLIA_RPC_URL=https://... pnpm --filter @preflight/core test:live
 *
 * Skipped automatically when SEPOLIA_RPC_URL is not set.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createLiveFork } from './live-fork'

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL
const skip = !SEPOLIA_RPC

describe.skipIf(skip)('createLiveFork — Sepolia E2E', () => {
  let dispose: (() => Promise<void>) | undefined

  afterEach(async () => {
    if (dispose) {
      await dispose()
      dispose = undefined
    }
  })

  it('should connect to Sepolia and return a valid rpcUrl', async () => {
    const fork = await createLiveFork({ network: 'sepolia' })
    dispose = fork.dispose

    expect(fork.network).toBe('sepolia')
    expect(fork.rpcUrl).toMatch(/^http:\/\//)
  }, 60_000)

  it('should expose a working viem client (getBlockNumber)', async () => {
    const fork = await createLiveFork({ network: 'sepolia' })
    dispose = fork.dispose

    const blockNumber = await fork.client.getBlockNumber()
    expect(blockNumber).toBeGreaterThan(0n)
  }, 60_000)

  it('should not expose stop — only dispose', async () => {
    const fork = await createLiveFork({ network: 'sepolia' })
    dispose = fork.dispose

    expect(fork).not.toHaveProperty('stop')
    expect(fork.dispose).toBeTypeOf('function')
  }, 60_000)
})

describe.skipIf(skip)('createLiveFork — rpcUrl 직접 제공', () => {
  let dispose: (() => Promise<void>) | undefined

  afterEach(async () => {
    if (dispose) {
      await dispose()
      dispose = undefined
    }
  })

  it('should accept rpcUrl directly instead of env var', async () => {
    const fork = await createLiveFork({
      network: 'sepolia',
      rpcUrl: SEPOLIA_RPC!,
    })
    dispose = fork.dispose
    expect(fork.network).toBe('sepolia')
  }, 60_000)
})
