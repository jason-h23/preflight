import { z } from 'zod'
import { privateKeyToAccount } from 'viem/accounts'
import { signAuthorization, verifyAuthorization } from '@clearance/eip7702'
import { toolError, toolSuccess } from '../tool-helpers.js'

const HEX_ADDRESS     = /^0x[0-9a-fA-F]{40}$/
const HEX_PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/
const INTEGER_STRING  = /^\d+$/

const signAuthSchema = z.object({
  privateKey: z
    .string()
    .regex(HEX_PRIVATE_KEY, 'Invalid private key — must be 0x + 64 hex chars')
    .describe('EOA private key (hex). Use only test keys in development.'),
  contract: z
    .string()
    .regex(HEX_ADDRESS, 'Invalid contract address')
    .describe('Contract address to delegate to'),
  chainId: z
    .string()
    .regex(INTEGER_STRING, 'chainId must be a positive integer string')
    .describe('Chain ID (e.g. "11155111" for Sepolia)'),
  nonce: z
    .string()
    .regex(INTEGER_STRING, 'nonce must be a non-negative integer string')
    .optional()
    .describe('EOA nonce at submission time. Defaults to 0 — use actual on-chain nonce in production.'),
})

const verifyAuthSchema = z.object({
  address:   z.string().regex(HEX_ADDRESS, 'Invalid signer address').describe('Signer EOA address'),
  nonce:     z.string().regex(INTEGER_STRING, 'Must be integer string'),
  chainId:   z.string().regex(INTEGER_STRING, 'Must be integer string'),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, 'Invalid hex signature'),
  contract:  z.string().regex(HEX_ADDRESS, 'Invalid contract address'),
  expectedAddress: z
    .string()
    .regex(HEX_ADDRESS, 'Invalid expected address')
    .optional()
    .describe('If provided, also checks that the recovered signer equals this address'),
})

async function signAuthHandler(params: z.infer<typeof signAuthSchema>) {
  try {
    const account = privateKeyToAccount(params.privateKey as `0x${string}`)
    const auth = await signAuthorization(
      account,
      params.contract as `0x${string}`,
      {
        chainId: BigInt(params.chainId),
        nonce:   params.nonce !== undefined ? BigInt(params.nonce) : undefined,
      }
    )
    return toolSuccess({
      address:   auth.address,
      nonce:     auth.nonce.toString(),
      chainId:   auth.chainId.toString(),
      signature: auth.signature,
    })
  } catch (err) {
    return toolError(err instanceof Error ? err.message : String(err))
  }
}

async function verifyAuthHandler(params: z.infer<typeof verifyAuthSchema>) {
  try {
    const auth = {
      address:   params.address as `0x${string}`,
      nonce:     BigInt(params.nonce),
      chainId:   BigInt(params.chainId),
      signature: params.signature as `0x${string}`,
    }
    const valid = await verifyAuthorization(
      auth,
      params.contract as `0x${string}`,
      params.expectedAddress ? { address: params.expectedAddress as `0x${string}` } : undefined,
    )
    return toolSuccess({ valid })
  } catch (err) {
    return toolError(err instanceof Error ? err.message : String(err))
  }
}

export const signAuthorizationTool = {
  name:        'sign_authorization' as const,
  description: 'Sign an EIP-7702 authorization delegating an EOA to a contract. Only use test private keys.',
  schema:      signAuthSchema,
  handler:     signAuthHandler,
}

export const verifyAuthorizationTool = {
  name:        'verify_authorization' as const,
  description: 'Verify an EIP-7702 authorization signature',
  schema:      verifyAuthSchema,
  handler:     verifyAuthHandler,
}
