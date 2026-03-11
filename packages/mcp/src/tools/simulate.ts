import { z } from 'zod'
import { randomUUID } from 'crypto'
import { createFork } from '@preflight/core'
import type { PublicClient } from 'viem'
import { getSession, addSession, getCachedClient, setCachedClient, clearCachedClient } from '../state.js'
import { toolError, toolSuccess, withTimeout } from '../tool-helpers.js'
import type { ForkSession } from '../types.js'

const FORK_TIMEOUT_MS = 30_000

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/
const HEX_DATA = /^0x[0-9a-fA-F]*$/
const INTEGER_STRING = /^\d+$/

const simulateSchema = z.object({
  from: z.string().regex(HEX_ADDRESS, 'Invalid from address'),
  to: z.string().regex(HEX_ADDRESS, 'Invalid to address'),
  value: z
    .string()
    .regex(INTEGER_STRING, 'value must be a non-negative integer string (wei)')
    .optional()
    .describe('Wei amount as decimal integer string'),
  data: z.string().regex(HEX_DATA, 'Invalid hex data').optional(),
  sessionId: z.string().optional().describe('Fork session ID; auto-creates if omitted'),
})

type AcquireResult =
  | { error: string }
  | { session: ForkSession; autoCreated: boolean }

async function acquireSession(
  sessionId: string | undefined,
  forkUrl: string,
): Promise<AcquireResult> {
  if (sessionId) {
    const session = getSession(sessionId)
    return session ? { session, autoCreated: false } : { error: `Session "${sessionId}" not found` }
  }

  let fork: Awaited<ReturnType<typeof createFork>>
  try {
    fork = await withTimeout(createFork({ rpc: forkUrl }), FORK_TIMEOUT_MS)
  } catch (err) {
    return { error: `Failed to create fork: ${err instanceof Error ? err.message : String(err)}` }
  }

  let blockNumber: bigint
  let chainId: number
  try {
    ;[blockNumber, chainId] = await withTimeout(
      Promise.all([fork.client.getBlockNumber(), fork.client.getChainId()]),
      FORK_TIMEOUT_MS,
    )
  } catch (err) {
    await fork.stop().catch(() => undefined)
    return { error: `Failed to query fork state: ${err instanceof Error ? err.message : String(err)}` }
  }

  const session: ForkSession = {
    id: randomUUID(),
    rpcUrl: fork.rpcUrl,
    forkUrl,
    blockNumber,
    chainId,
    createdAt: new Date(),
    stop: fork.stop,
  }

  try {
    addSession(session)
    setCachedClient(session.id, fork.client)
    return { session, autoCreated: true }
  } catch (err) {
    clearCachedClient(session.id)
    await fork.stop().catch(() => undefined)
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

interface SimParams {
  from: string
  to: string
  value: string | undefined
  data: string | undefined
}

interface SimOutput {
  success: boolean
  revertReason?: string
  balanceChanges: Record<string, bigint>
  gasUsed: bigint
}

async function executeSim(client: PublicClient, params: SimParams): Promise<SimOutput> {
  const { from, to, value, data } = params
  const fromHex = from as `0x${string}`
  const toHex = to as `0x${string}`
  const valueBig = value !== undefined ? BigInt(value) : undefined
  const dataHex = data as `0x${string}` | undefined

  let success = true
  let revertReason: string | undefined
  try {
    await client.call({ account: fromHex, to: toHex, value: valueBig, data: dataHex })
  } catch (err) {
    success = false
    revertReason = err instanceof Error ? err.message : String(err)
  }

  let gasUsed = 0n
  try {
    gasUsed = await client.estimateGas({ account: fromHex, to: toHex, value: valueBig, data: dataHex })
  } catch {
    // gas estimation may fail for reverted txs; gasUsed stays 0n
  }

  // ETH-only balance approximation for simple transfers.
  // Transactions with calldata (ERC-20, contract calls) return {} because
  // accurate balance changes require debug_traceCall, which is not yet supported.
  const isSimpleEthTransfer = (!data || data === '0x') && valueBig !== undefined && valueBig > 0n
  const balanceChanges: Record<string, bigint> = isSimpleEthTransfer
    ? { [from]: -valueBig!, [to]: valueBig! }
    : {}

  return { success, revertReason, balanceChanges, gasUsed }
}

async function simulateHandler(params: z.infer<typeof simulateSchema>) {
  const { from, to, value, data, sessionId } = params
  const forkUrl = process.env.PREFLIGHT_FORK_URL
  if (!forkUrl) return toolError('PREFLIGHT_FORK_URL environment variable is not set')

  const acquired = await acquireSession(sessionId, forkUrl)
  if ('error' in acquired) return toolError(acquired.error)
  const { session, autoCreated } = acquired

  try {
    const client = await getOrCreateClient(session)
    const sim = await executeSim(client, { from, to, value, data })
    return toolSuccess({
      sessionId: session.id,
      success: sim.success,
      ...(sim.revertReason !== undefined ? { revertReason: sim.revertReason } : {}),
      balanceChanges: Object.fromEntries(
        Object.entries(sim.balanceChanges).map(([k, v]) => [k, v.toString()])
      ),
      gasUsed: sim.gasUsed.toString(),
      simulatedAt: new Date().toISOString(),
      ...(autoCreated ? { autoCreatedSessionId: session.id } : {}),
    })
  } catch (err) {
    return toolError(`Simulation failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function getOrCreateClient(session: ForkSession): Promise<PublicClient> {
  const cached = getCachedClient(session.id)
  if (cached) return cached as PublicClient

  const { createPublicClient, http, defineChain } = await import('viem')
  const chain = defineChain({
    id: session.chainId,
    name: 'fork',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [session.rpcUrl] } },
  })
  const client = createPublicClient({ chain, transport: http(session.rpcUrl) })
  setCachedClient(session.id, client)
  return client as PublicClient
}

export const simulateTransactionTool = {
  name: 'simulate_transaction' as const,
  description: 'Simulate an Ethereum transaction on an Anvil fork and return the result',
  schema: simulateSchema,
  handler: simulateHandler,
}
