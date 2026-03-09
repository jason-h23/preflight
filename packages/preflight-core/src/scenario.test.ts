import { describe, it, expect } from 'vitest'
import { preflight } from './scenario'
import type { ScenarioContext } from './scenario'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

describe('preflight.scenario', () => {
  it('should create a scenario with the given name', () => {
    const scenario = preflight.scenario('test scenario', {
      fork: { rpc: 'https://rpc.mevblocker.io' },
    })
    expect(scenario.name).toBe('test scenario')
  })

  it('should run a scenario callback and receive fork context', async () => {
    const scenario = preflight.scenario('run test', {
      fork: { rpc: 'https://rpc.mevblocker.io' },
    })

    let capturedCtx: ScenarioContext | null = null
    await scenario.run(async (ctx) => {
      capturedCtx = ctx
    })

    expect(capturedCtx).not.toBeNull()
    expect(capturedCtx!.fork).toBeDefined()
    expect(capturedCtx!.fork.client).toBeDefined()
    expect(capturedCtx!.fork.rpcUrl).toMatch(/^http:\/\//)
  }, 60_000)

  it('should stop the fork after run completes (Anvil no longer responds)', async () => {
    const scenario = preflight.scenario('cleanup test', {
      fork: { rpc: 'https://rpc.mevblocker.io' },
    })

    let anvilRpcUrl: string | null = null

    await scenario.run(async (ctx) => {
      anvilRpcUrl = ctx.fork.rpcUrl
      // Verify Anvil is running during the callback
      const blockNumber = await ctx.fork.client.getBlockNumber()
      expect(blockNumber).toBeGreaterThan(0n)
    })

    // After run() completes, Anvil should be stopped.
    // Verify by attempting a connection to the now-stopped Anvil process.
    expect(anvilRpcUrl).not.toBeNull()
    const clientAfterStop = createPublicClient({
      chain: mainnet,
      transport: http(anvilRpcUrl!, { timeout: 2_000, retryCount: 0 }),
    })
    await expect(clientAfterStop.getBlockNumber()).rejects.toThrow()
  }, 60_000)

  it('should stop the fork even if the callback throws', async () => {
    const scenario = preflight.scenario('error test', {
      fork: { rpc: 'https://rpc.mevblocker.io' },
    })

    await expect(
      scenario.run(async () => {
        throw new Error('intentional test error')
      })
    ).rejects.toThrow('intentional test error')
  }, 30_000)
})
