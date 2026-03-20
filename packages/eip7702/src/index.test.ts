import { describe, it, expect } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { signAuthorization, verifyAuthorization, createEip7702Clearance } from './index'

/**
 * Hardhat default test key — public, no real assets.
 * @see https://hardhat.org/hardhat-network/docs/reference#accounts
 */
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY)

const TEST_CONTRACT = '0x1234567890abcdef1234567890abcdef12345678' as const
const OTHER_CONTRACT = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as const

describe('signAuthorization', () => {
  it('should exist and be a function', () => {
    expect(signAuthorization).toBeTypeOf('function')
  })

  it('should return an Authorization with address, nonce, chainId, and signature', async () => {
    const auth = await signAuthorization(testAccount, TEST_CONTRACT)

    expect(auth).toHaveProperty('address')
    expect(auth).toHaveProperty('nonce')
    expect(auth).toHaveProperty('chainId')
    expect(auth).toHaveProperty('signature')

    expect(typeof auth.address).toBe('string')
    expect(typeof auth.nonce).toBe('bigint')
    expect(typeof auth.chainId).toBe('bigint')
    expect(typeof auth.signature).toBe('string')
  })

  it('should default to chainId=1 (mainnet) and nonce=0 when options are omitted', async () => {
    const auth = await signAuthorization(testAccount, TEST_CONTRACT)

    expect(auth.chainId).toBe(1n)
    expect(auth.nonce).toBe(0n)
  })

  it('should throw for chainId=0', async () => {
    await expect(
      signAuthorization(testAccount, TEST_CONTRACT, { chainId: 0n })
    ).rejects.toThrow(/Invalid chainId/)
  })

  it('should set the address to the signer address', async () => {
    const auth = await signAuthorization(testAccount, TEST_CONTRACT)
    expect(auth.address.toLowerCase()).toBe(testAccount.address.toLowerCase())
  })

  it('should accept optional chainId and nonce', async () => {
    const auth = await signAuthorization(testAccount, TEST_CONTRACT, {
      chainId: 11155111n,
      nonce: 42n,
    })
    expect(auth.chainId).toBe(11155111n)
    expect(auth.nonce).toBe(42n)
  })

  it('should throw for an invalid contract address', async () => {
    await expect(
      signAuthorization(testAccount, '0x123' as `0x${string}`)
    ).rejects.toThrow(/Invalid contract address/)
  })
})

describe('verifyAuthorization', () => {
  it('should exist and be a function', () => {
    expect(verifyAuthorization).toBeTypeOf('function')
  })

  it('should return true for a valid authorization', async () => {
    const auth = await signAuthorization(testAccount, TEST_CONTRACT)
    const result = await verifyAuthorization(auth, TEST_CONTRACT)
    expect(result).toBe(true)
  })

  it('should return false for an authorization with a tampered signature', async () => {
    const auth = await signAuthorization(testAccount, TEST_CONTRACT)
    const tampered = {
      ...auth,
      signature: '0x' + 'ab'.repeat(65) as `0x${string}`,
    }
    const result = await verifyAuthorization(tampered, TEST_CONTRACT)
    expect(result).toBe(false)
  })

  it('should return false when expected.address does not match', async () => {
    const auth = await signAuthorization(testAccount, TEST_CONTRACT)
    const result = await verifyAuthorization(auth, TEST_CONTRACT, {
      address: '0x0000000000000000000000000000000000000001',
    })
    expect(result).toBe(false)
  })

  it('should return false for a signature from a different contract context (replay attack)', async () => {
    // auth signed for OTHER_CONTRACT — must NOT verify against TEST_CONTRACT
    const authForOther = await signAuthorization(testAccount, OTHER_CONTRACT)
    const result = await verifyAuthorization(authForOther, TEST_CONTRACT)
    expect(result).toBe(false)
  })

  it('should return false for an authorization with a tampered nonce', async () => {
    const auth = await signAuthorization(testAccount, TEST_CONTRACT, { chainId: 1n, nonce: 0n })
    const tampered = { ...auth, nonce: auth.nonce + 1n }
    const result = await verifyAuthorization(tampered, TEST_CONTRACT)
    expect(result).toBe(false)
  })

  it('should return false for a signature with a different chainId', async () => {
    const authMainnet = await signAuthorization(testAccount, TEST_CONTRACT, { chainId: 1n })
    const authSepolia = await signAuthorization(testAccount, TEST_CONTRACT, { chainId: 11155111n })
    // mainnet auth must not verify against sepolia context
    const spoofed = { ...authMainnet, chainId: 11155111n }
    const result = await verifyAuthorization(spoofed, TEST_CONTRACT)
    expect(result).toBe(false)
    // but original sepolia auth should pass
    expect(await verifyAuthorization(authSepolia, TEST_CONTRACT)).toBe(true)
  })
})

describe('createEip7702Clearance', () => {
  it('should exist and be a function', () => {
    expect(createEip7702Clearance).toBeTypeOf('function')
  })

  it('should return a Clearance object with expected interface', async () => {
    const auth = await signAuthorization(testAccount, TEST_CONTRACT)
    const permissions = {
      allowedContracts: [TEST_CONTRACT],
      allowedActions: ['swap'],
      spendLimit: { ETH: 1_000_000_000_000_000_000n },
      expiry: 86400,
    }

    const clearance = createEip7702Clearance(auth, permissions)

    expect(clearance).toHaveProperty('agent')
    expect(clearance).toHaveProperty('permissions')
    expect(clearance).toHaveProperty('spentAmounts')
    expect(clearance.check).toBeTypeOf('function')
    expect(clearance.validate).toBeTypeOf('function')
    expect(clearance.isExpired).toBeTypeOf('function')
  })

  it('should use the authorization address as the agent', async () => {
    const auth = await signAuthorization(testAccount, TEST_CONTRACT)
    const permissions = {
      allowedContracts: [TEST_CONTRACT],
      allowedActions: ['swap'],
      spendLimit: {},
      expiry: 3600,
    }

    const clearance = createEip7702Clearance(auth, permissions)
    expect(clearance.agent.toLowerCase()).toBe(auth.address.toLowerCase())
  })
})
