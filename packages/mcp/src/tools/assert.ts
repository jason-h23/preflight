import { z } from 'zod'
import type { PublicClient } from 'viem'
import { getSession, getCachedClient, setCachedClient } from '../state.js'
import { toolError, toolSuccess } from '../tool-helpers.js'

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/
const HEX_VALUE   = /^0x[0-9a-fA-F]+$/
const INT_STRING  = /^\d+$/

const assertionSchema = z.union([
  z.object({
    type:    z.literal('balance'),
    address: z.string().regex(HEX_ADDRESS, 'Invalid address'),
    gte:     z.string().regex(INT_STRING, 'gte must be integer string in wei').optional(),
    eq:      z.string().regex(INT_STRING, 'eq must be integer string in wei').optional(),
  }).refine(d => d.gte !== undefined || d.eq !== undefined, {
    message: 'balance assertion requires at least one of: gte, eq',
  }),
  z.object({
    type:    z.literal('hasCode'),
    address: z.string().regex(HEX_ADDRESS, 'Invalid address'),
  }),
  z.object({
    type:    z.literal('storageSlot'),
    address: z.string().regex(HEX_ADDRESS, 'Invalid address'),
    slot:    z.string().regex(HEX_VALUE, 'slot must be hex string'),
    eq:      z.string().regex(HEX_VALUE, 'eq must be hex string'),
  }),
])

export const assertOnChainSchema = z.object({
  sessionId:  z.string().min(1, 'sessionId is required'),
  assertions: z.array(assertionSchema).min(1, 'at least one assertion required'),
})

type Assertion = z.infer<typeof assertionSchema>

interface AssertionResult {
  readonly type:    string
  readonly passed:  boolean
  readonly reason?: string
  readonly actual?: string
}

async function runAssertion(
  client: PublicClient,
  assertion: Assertion,
): Promise<AssertionResult> {
  const addr = assertion.address as `0x${string}`

  if (assertion.type === 'balance') {
    const actual = await client.getBalance({ address: addr })
    if (assertion.eq !== undefined) {
      const expected = BigInt(assertion.eq)
      const passed = actual === expected
      return {
        type: 'balance',
        passed,
        actual: actual.toString(),
        ...(!passed ? { reason: `balance ${actual} !== expected ${expected}` } : {}),
      }
    }
    if (assertion.gte !== undefined) {
      const threshold = BigInt(assertion.gte)
      const passed = actual >= threshold
      return {
        type: 'balance',
        passed,
        actual: actual.toString(),
        ...(!passed ? { reason: `balance ${actual} < required ${threshold}` } : {}),
      }
    }
    // Unreachable: schema .refine() guarantees gte or eq is present
    throw new Error('invariant: balance assertion must have gte or eq')
  }

  if (assertion.type === 'hasCode') {
    const code = await client.getCode({ address: addr })
    const passed = code !== undefined && code !== '0x'
    return {
      type: 'hasCode',
      passed,
      ...(!passed ? { reason: `no contract code at ${addr}` } : {}),
    }
  }

  // storageSlot
  const actual = await client.getStorageAt({ address: addr, slot: assertion.slot as `0x${string}` })
  const normalised = (actual ?? '0x0').toLowerCase()
  const expected   = assertion.eq.toLowerCase()
  const passed     = normalised === expected
  return {
    type:   'storageSlot',
    passed,
    actual: actual ?? '0x0',
    ...(!passed ? { reason: `storage slot ${assertion.slot}: ${actual} !== ${assertion.eq}` } : {}),
  }
}

async function getOrCreateClient(rpcUrl: string, chainId: number, sessionId: string): Promise<PublicClient> {
  const cached = getCachedClient(sessionId)
  if (cached) return cached as PublicClient

  const { createPublicClient, http, defineChain } = await import('viem')
  const chain = defineChain({
    id: chainId,
    name: 'fork',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  })
  const client = createPublicClient({ chain, transport: http(rpcUrl) })
  setCachedClient(sessionId, client)
  return client as PublicClient
}

async function assertOnChainHandler(params: z.infer<typeof assertOnChainSchema>) {
  const session = getSession(params.sessionId)
  if (!session) return toolError(`Session not found: ${params.sessionId}`)

  try {
    const client = await getOrCreateClient(session.rpcUrl, session.chainId, session.id)
    const results: AssertionResult[] = await Promise.all(
      params.assertions.map(a => runAssertion(client, a))
    )
    const passed = results.every(r => r.passed)
    return toolSuccess({ passed, results })
  } catch (err) {
    return toolError(`Assertion failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export const assertOnChainTool = {
  name:        'assert_on_chain' as const,
  description: 'Verify on-chain state after simulation: check balances, contract code existence, or storage slots',
  schema:      assertOnChainSchema,
  handler:     assertOnChainHandler,
}
