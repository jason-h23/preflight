export interface ForkSession {
  readonly id: string
  readonly rpcUrl: string
  readonly forkUrl: string
  readonly blockNumber: bigint
  readonly chainId: number
  readonly createdAt: Date
  readonly stop: () => Promise<void>
}

export interface SimulationResult {
  readonly sessionId: string
  readonly success: boolean
  readonly revertReason?: string
  readonly balanceChanges: Record<string, bigint>
  readonly gasUsed: bigint
  readonly simulatedAt: Date
}

export interface ClearancePolicy {
  readonly maxAmount: bigint
  readonly token: string
  readonly recipient?: string
  readonly expiresAt?: number
  spentAmounts: Map<string, bigint>
}
