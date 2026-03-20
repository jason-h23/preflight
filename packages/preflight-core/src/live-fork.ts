import { createFork, type Fork } from './fork'

export type LiveForkOptions = {
  readonly network: 'sepolia' | 'base-sepolia'
  readonly rpcUrl?: string
}

/**
 * A live testnet fork — extends Fork but exposes `dispose` instead of `stop`
 * to signal intentional lifecycle management.
 */
export type LiveFork = Omit<Fork, 'stop'> & {
  readonly network: LiveForkOptions['network']
  readonly dispose: () => Promise<void>
}

const NETWORK_ENV_VARS: Record<LiveForkOptions['network'], string> = {
  'sepolia': 'SEPOLIA_RPC_URL',
  'base-sepolia': 'BASE_SEPOLIA_RPC_URL',
}

export async function createLiveFork(options: LiveForkOptions): Promise<LiveFork> {
  const { network, rpcUrl: providedRpcUrl } = options

  const envVar = NETWORK_ENV_VARS[network]
  const rpcUrl = (providedRpcUrl ?? process.env[envVar])?.trim()

  if (!rpcUrl) {
    throw new Error(
      `RPC URL required: set ${envVar} environment variable or provide rpcUrl option`
    )
  }

  if (!/^https?:\/\//i.test(rpcUrl)) {
    throw new Error(
      `Invalid RPC URL: must start with http:// or https:// (got "${rpcUrl}")`
    )
  }

  const { stop, ...fork } = await createFork({ rpc: rpcUrl })

  return {
    ...fork,
    network,
    dispose: stop,
  }
}
