import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLiveFork } from './live-fork'
import { createFork } from './fork'

vi.mock('./fork', () => ({
  createFork: vi.fn().mockResolvedValue({
    client: {},
    rpcUrl: 'http://127.0.0.1:54321',
    stop: vi.fn(),
  }),
}))

const mockCreateFork = vi.mocked(createFork)

describe('createLiveFork', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mockCreateFork.mockResolvedValue({
      client: {},
      rpcUrl: 'http://127.0.0.1:54321',
      stop: vi.fn(),
    })
  })

  it('should exist and be a function', () => {
    expect(createLiveFork).toBeTypeOf('function')
  })

  it('should create a fork for sepolia network', async () => {
    vi.stubEnv('SEPOLIA_RPC_URL', 'https://sepolia.example.com')

    const fork = await createLiveFork({ network: 'sepolia' })

    expect(fork).toBeDefined()
    expect(fork.rpcUrl).toMatch(/^http:\/\//)
  })

  it('should create a fork for base-sepolia network', async () => {
    vi.stubEnv('BASE_SEPOLIA_RPC_URL', 'https://base-sepolia.example.com')

    const fork = await createLiveFork({ network: 'base-sepolia' })

    expect(fork).toBeDefined()
    expect(fork.rpcUrl).toMatch(/^http:\/\//)
  })

  it('should use rpcUrl when provided directly', async () => {
    const fork = await createLiveFork({
      network: 'sepolia',
      rpcUrl: 'https://custom-rpc.example.com',
    })

    expect(fork).toBeDefined()
  })

  it('should throw a clear error when env var is missing and no rpcUrl provided', async () => {
    vi.stubEnv('SEPOLIA_RPC_URL', '')

    await expect(
      createLiveFork({ network: 'sepolia' })
    ).rejects.toThrow(/SEPOLIA_RPC_URL/)
  })

  it('should include network field in the returned LiveFork', async () => {
    vi.stubEnv('SEPOLIA_RPC_URL', 'https://sepolia.example.com')

    const fork = await createLiveFork({ network: 'sepolia' })

    expect(fork.network).toBe('sepolia')
  })

  it('should have a dispose method on the returned LiveFork', async () => {
    vi.stubEnv('SEPOLIA_RPC_URL', 'https://sepolia.example.com')

    const fork = await createLiveFork({ network: 'sepolia' })

    expect(fork.dispose).toBeTypeOf('function')
  })

  it('should not expose stop — only dispose', async () => {
    vi.stubEnv('SEPOLIA_RPC_URL', 'https://sepolia.example.com')

    const fork = await createLiveFork({ network: 'sepolia' })

    expect(fork).not.toHaveProperty('stop')
    expect(fork.dispose).toBeTypeOf('function')
  })

  it('should propagate errors from the underlying fork creation', async () => {
    vi.stubEnv('SEPOLIA_RPC_URL', 'https://sepolia.example.com')
    mockCreateFork.mockRejectedValueOnce(new Error('Anvil failed to start'))

    await expect(
      createLiveFork({ network: 'sepolia' })
    ).rejects.toThrow('Anvil failed to start')
  })

  it('should call the underlying stop when dispose is invoked', async () => {
    vi.stubEnv('SEPOLIA_RPC_URL', 'https://sepolia.example.com')
    const mockStop = vi.fn().mockResolvedValue(undefined)
    mockCreateFork.mockResolvedValueOnce({
      client: {},
      rpcUrl: 'http://127.0.0.1:54321',
      stop: mockStop,
    })

    const fork = await createLiveFork({ network: 'sepolia' })
    await fork.dispose()

    expect(mockStop).toHaveBeenCalledOnce()
  })

  it('should throw for an invalid rpcUrl format (sepolia)', async () => {
    await expect(
      createLiveFork({ network: 'sepolia', rpcUrl: 'not-a-url' })
    ).rejects.toThrow(/Invalid RPC URL/)
  })

  it('should throw for an invalid rpcUrl format (base-sepolia)', async () => {
    await expect(
      createLiveFork({ network: 'base-sepolia', rpcUrl: 'ftp://invalid' })
    ).rejects.toThrow(/Invalid RPC URL/)
  })

  it('should propagate errors thrown by dispose (i.e. underlying stop)', async () => {
    vi.stubEnv('SEPOLIA_RPC_URL', 'https://sepolia.example.com')
    const mockStop = vi.fn().mockRejectedValueOnce(new Error('stop failed'))
    mockCreateFork.mockResolvedValueOnce({
      client: {},
      rpcUrl: 'http://127.0.0.1:54321',
      stop: mockStop,
    })

    const fork = await createLiveFork({ network: 'sepolia' })

    await expect(fork.dispose()).rejects.toThrow('stop failed')
  })
})
