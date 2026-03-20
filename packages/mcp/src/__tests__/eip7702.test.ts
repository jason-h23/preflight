import { describe, it, expect } from 'vitest'
import { signAuthorizationTool, verifyAuthorizationTool } from '../tools/eip7702.js'

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const TEST_CONTRACT    = '0x1234567890abcdef1234567890abcdef12345678'
const TEST_ADDRESS     = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

describe('sign_authorization tool', () => {
  it('should exist and have correct name', () => {
    expect(signAuthorizationTool.name).toBe('sign_authorization')
  })

  it('should return an Authorization object', async () => {
    const result = await signAuthorizationTool.handler({
      privateKey: TEST_PRIVATE_KEY,
      contract: TEST_CONTRACT,
      chainId: '11155111',
      nonce: '0',
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.address).toBeDefined()
    expect(data.signature).toMatch(/^0x/)
    expect(data.chainId).toBe('11155111')
    expect(data.nonce).toBe('0')
  })

  it('should return error for invalid private key', async () => {
    const result = await signAuthorizationTool.handler({
      privateKey: '0xinvalid',
      contract: TEST_CONTRACT,
      chainId: '1',
    })
    expect(result.isError).toBe(true)
  })

  it('should return error for invalid contract address', async () => {
    const result = await signAuthorizationTool.handler({
      privateKey: TEST_PRIVATE_KEY,
      contract: '0x1234',
      chainId: '1',
    })
    expect(result.isError).toBe(true)
  })
})

describe('verify_authorization tool', () => {
  it('should exist and have correct name', () => {
    expect(verifyAuthorizationTool.name).toBe('verify_authorization')
  })

  it('should return valid: true for a freshly signed authorization', async () => {
    const signed = await signAuthorizationTool.handler({
      privateKey: TEST_PRIVATE_KEY,
      contract: TEST_CONTRACT,
      chainId: '11155111',
      nonce: '0',
    })
    const auth = JSON.parse(signed.content[0].text)

    const result = await verifyAuthorizationTool.handler({
      address: auth.address,
      nonce: auth.nonce,
      chainId: auth.chainId,
      signature: auth.signature,
      contract: TEST_CONTRACT,
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.valid).toBe(true)
  })

  it('should return valid: false for a tampered signature', async () => {
    const result = await verifyAuthorizationTool.handler({
      address: TEST_ADDRESS,
      nonce: '0',
      chainId: '11155111',
      signature: '0x' + 'ab'.repeat(65),
      contract: TEST_CONTRACT,
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.valid).toBe(false)
  })

  it('should return valid: false when expectedAddress does not match signer', async () => {
    const signed = await signAuthorizationTool.handler({
      privateKey: TEST_PRIVATE_KEY,
      contract: TEST_CONTRACT,
      chainId: '11155111',
      nonce: '0',
    })
    const auth = JSON.parse(signed.content[0].text)

    const result = await verifyAuthorizationTool.handler({
      address: auth.address,
      nonce: auth.nonce,
      chainId: auth.chainId,
      signature: auth.signature,
      contract: TEST_CONTRACT,
      expectedAddress: '0x0000000000000000000000000000000000000001',
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.valid).toBe(false)
  })

  it('should return error for malformed nonce (non-integer string)', async () => {
    const result = await verifyAuthorizationTool.handler({
      address:   TEST_ADDRESS,
      nonce:     'not-a-number',
      chainId:   '1',
      signature: '0x' + 'ab'.repeat(65),
      contract:  TEST_CONTRACT,
    })
    expect(result.isError).toBe(true)
  })
})
