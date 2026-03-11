import { z } from 'zod'
import { randomUUID } from 'crypto'
import { createFork } from '@preflight/core'
import { addSession, getSession, removeSession } from '../state.js'
import { toolError, toolSuccess, withTimeout } from '../tool-helpers.js'
import type { ForkSession } from '../types.js'

const FORK_TIMEOUT_MS = 30_000
const INTEGER_STRING = /^\d+$/

const createForkSchema = z.object({
  forkUrl: z.string().url('Invalid RPC URL').optional(),
  blockNumber: z
    .string()
    .regex(INTEGER_STRING, 'blockNumber must be a non-negative integer string')
    .optional(),
})

const resetForkSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
})

interface ForkHandle {
  rpcUrl: string
  blockNumber: bigint
  chainId: number
  stop: () => Promise<void>
}

/** Creates an Anvil fork and resolves its block number and chain ID. Cleans up on failure. */
async function launchFork(
  rpc: string,
  blockNumber: bigint | undefined,
): Promise<{ error: string } | ForkHandle> {
  let fork: Awaited<ReturnType<typeof createFork>>
  try {
    fork = await withTimeout(createFork({ rpc, blockNumber }), FORK_TIMEOUT_MS)
  } catch (err) {
    return { error: `Failed to create fork: ${err instanceof Error ? err.message : String(err)}` }
  }

  let resolvedBlockNumber: bigint
  let chainId: number
  try {
    ;[resolvedBlockNumber, chainId] = await withTimeout(
      Promise.all([
        blockNumber !== undefined ? Promise.resolve(blockNumber) : fork.client.getBlockNumber(),
        fork.client.getChainId(),
      ]),
      FORK_TIMEOUT_MS,
    )
  } catch (err) {
    await fork.stop().catch(() => undefined)
    return { error: `Failed to query fork state: ${err instanceof Error ? err.message : String(err)}` }
  }

  return { rpcUrl: fork.rpcUrl, blockNumber: resolvedBlockNumber, chainId, stop: fork.stop }
}

async function createForkHandler(params: z.infer<typeof createForkSchema>) {
  const forkUrl = params.forkUrl || process.env.PREFLIGHT_FORK_URL
  if (!forkUrl) return toolError('No fork URL provided. Set PREFLIGHT_FORK_URL or pass forkUrl parameter.')

  const blockNumber = params.blockNumber !== undefined ? BigInt(params.blockNumber) : undefined
  const fork = await launchFork(forkUrl, blockNumber)
  if ('error' in fork) return toolError(fork.error)

  const session: ForkSession = {
    id: randomUUID(),
    rpcUrl: fork.rpcUrl,
    forkUrl,
    blockNumber: fork.blockNumber,
    chainId: fork.chainId,
    createdAt: new Date(),
    stop: fork.stop,
  }

  try {
    addSession(session)
  } catch (err) {
    await fork.stop().catch(() => undefined)
    return toolError(err instanceof Error ? err.message : String(err))
  }

  return toolSuccess({
    sessionId: session.id,
    rpcUrl: session.rpcUrl,
    blockNumber: String(session.blockNumber),
    createdAt: session.createdAt.toISOString(),
  })
}

async function resetForkHandler(params: z.infer<typeof resetForkSchema>) {
  const existing = getSession(params.sessionId)
  if (!existing) return toolError(`Session not found: ${params.sessionId}`)

  // Create new fork BEFORE removing old session so we don't lose state on failure
  let fork: Awaited<ReturnType<typeof createFork>>
  try {
    fork = await withTimeout(
      createFork({ rpc: existing.forkUrl, blockNumber: existing.blockNumber }),
      FORK_TIMEOUT_MS,
    )
  } catch (err) {
    return toolError(`Failed to reset fork: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    await existing.stop()
  } catch {
    // Best-effort cleanup of old fork process
  }

  removeSession(params.sessionId)

  const session: ForkSession = {
    id: randomUUID(),
    rpcUrl: fork.rpcUrl,
    forkUrl: existing.forkUrl,
    blockNumber: existing.blockNumber,
    chainId: existing.chainId,
    createdAt: new Date(),
    stop: fork.stop,
  }

  addSession(session)

  return toolSuccess({
    sessionId: session.id,
    rpcUrl: session.rpcUrl,
    blockNumber: String(session.blockNumber),
    previousSessionId: params.sessionId,
    createdAt: session.createdAt.toISOString(),
  })
}

export const createForkTool = {
  name: 'create_fork' as const,
  description: 'Create a new Anvil fork of an EVM chain for transaction simulation',
  schema: createForkSchema,
  handler: createForkHandler,
}

export const resetForkTool = {
  name: 'reset_fork' as const,
  description: 'Reset an existing fork session to its original block state',
  schema: resetForkSchema,
  handler: resetForkHandler,
}
