import {
  type Address,
  type Hex,
  keccak256,
  toRlp,
  concat,
  toHex,
  isAddress,
  recoverMessageAddress,
} from 'viem'
import type { LocalAccount } from 'viem/accounts'
import { createClearance, type Permissions, type Clearance } from '@clearance/core'

/**
 * Ethereum mainnet chainId.
 * Used as the default when no chainId is provided — intentionally mainnet so
 * production mistakes are loud. Always pass chainId explicitly.
 */
const DEFAULT_CHAIN_ID = 1n

export type Authorization = {
  readonly address: Address
  readonly nonce: bigint
  readonly chainId: bigint
  readonly signature: Hex
}

export type SignAuthOptions = {
  readonly chainId?: bigint
  readonly nonce?: bigint
}

/**
 * Computes the EIP-7702 authorization hash.
 * Spec: keccak256(0x05 || rlp([chain_id, address, nonce]))
 * Argument order matches the RLP tuple: chainId first, then address, then nonce.
 * @see https://eips.ethereum.org/EIPS/eip-7702
 */
function getAuthorizationHash(
  chainId: bigint,
  contract: Address,
  nonce: bigint
): Hex {
  // EIP-7702 §3: signed_authorization = keccak256(MAGIC || rlp([chain_id, address, nonce]))
  const encoded = toRlp([toHex(chainId), contract, toHex(nonce)])
  return keccak256(concat(['0x05', encoded]))
}

/**
 * Signs an EIP-7702 authorization delegating `account` to `contract`.
 *
 * **Signing method note:** Uses `account.signMessage({ message: { raw: hash } })`,
 * which prepends the Ethereum Signed Message prefix (`\x19Ethereum Signed Message:\n32`).
 * This is intentional: it ensures compatibility with `recoverMessageAddress` in
 * `verifyAuthorization`. It is NOT the raw EIP-7702 signing defined in the spec
 * (which uses a bare ECDSA sign over the hash). Do not mix with wallets that
 * implement bare EIP-7702 signing.
 */
export async function signAuthorization(
  account: LocalAccount,
  contract: Address,
  options: SignAuthOptions = {}
): Promise<Authorization> {
  if (!isAddress(contract)) {
    throw new Error(`Invalid contract address: ${contract}`)
  }

  const chainId = options.chainId ?? DEFAULT_CHAIN_ID
  if (chainId <= 0n) {
    throw new Error(`Invalid chainId: ${chainId} — must be a positive integer`)
  }

  // WARNING: nonce=0n is the default, but on-chain nonce must match the EOA's
  // actual nonce at submission time. Always provide the correct nonce in production.
  const nonce = options.nonce ?? 0n

  const hash = getAuthorizationHash(chainId, contract, nonce)
  const signature = await account.signMessage({ message: { raw: hash } })

  return {
    address: account.address,
    nonce,
    chainId,
    signature,
  }
}

/**
 * Verifies that an EIP-7702 authorization was signed by the address in `auth`.
 * Uses `recoverMessageAddress` — must be paired with `signAuthorization` from
 * this module (which uses `signMessage` with the Ethereum prefix).
 *
 * @param expected - When provided, also checks that the recovered signer matches
 *   `expected.address`. Requires `address` — passing an empty object is a type error.
 */
export async function verifyAuthorization(
  auth: Authorization,
  contract: Address,
  expected?: { readonly address: Address }
): Promise<boolean> {
  try {
    const hash = getAuthorizationHash(auth.chainId, contract, auth.nonce)
    const recovered = await recoverMessageAddress({
      message: { raw: hash },
      signature: auth.signature,
    })

    if (recovered.toLowerCase() !== auth.address.toLowerCase()) return false
    if (expected?.address) {
      return recovered.toLowerCase() === expected.address.toLowerCase()
    }

    return true
  } catch {
    return false
  }
}

export function createEip7702Clearance(
  auth: Authorization,
  permissions: Permissions
): Clearance {
  return createClearance({
    agent: auth.address,
    permissions,
  })
}
