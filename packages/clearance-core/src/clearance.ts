/**
 * Clearance — permission-scoped execution guard for AI agents.
 *
 * Like a security badge with a time limit:
 * the agent can only call specific contracts, run specific actions,
 * and spend up to a defined token limit — all within an expiry window.
 */

/**
 * Defines what an agent is permitted to do:
 * which contracts, which actions, how much to spend, and for how long.
 */
export interface Permissions {
  /** List of contract addresses the agent may call (case-insensitive comparison) */
  readonly allowedContracts: readonly string[]
  /** List of action names (e.g. 'swap', 'addLiquidity') the agent may execute */
  readonly allowedActions: readonly string[]
  /**
   * Per-token spend limits (bigint wei amounts). Token keys are compared
   * case-insensitively (normalized to uppercase internally).
   * If a token key is present, cumulative spend of that token must not exceed its value.
   * Tokens not listed in spendLimit are unconstrained but still tracked in `spentAmounts`.
   */
  readonly spendLimit: Readonly<Record<string, bigint>>
  /** How long (in seconds) this clearance is valid after creation */
  readonly expiry: number
}

/** Options passed to `createClearance` */
export interface ClearanceOptions {
  /** The agent's identifier (address or name) */
  readonly agent: string
  /** Permission scope for this clearance */
  readonly permissions: Permissions
}

/**
 * A proposed agent call to be validated.
 * All fields are checked against the clearance permissions.
 *
 * **Case sensitivity note:**
 * - `action` is matched **case-sensitively** against `allowedActions`.
 *   `'swap'` and `'Swap'` are treated as different actions.
 * - `contract` is matched **case-insensitively** against `allowedContracts`
 *   (EVM addresses are functionally equivalent regardless of checksum casing).
 */
export interface AgentCall {
  /** The action name being attempted (case-sensitive) */
  readonly action: string
  /** The contract address being called (case-insensitive comparison) */
  readonly contract: string
  /**
   * Optional token spend to validate against spendLimit.
   * Token key is compared case-insensitively.
   * Amount must be >= 0n.
   */
  readonly spend?: {
    /** Token symbol or address */
    readonly token: string
    /** Amount in wei (bigint). Must be >= 0n. */
    readonly amount: bigint
  }
}

/**
 * A live clearance object with permission enforcement and expiry checking.
 *
 * Created by `createClearance`.
 *
 * **Two methods for permission checking:**
 * - `check(call)` — pure read-only check; safe for dry-run previews, does NOT accumulate spend.
 * - `validate(call)` — stateful check; accumulates spend toward the budget on success.
 *   Call this only when actually committing an agent action.
 *
 * **Concurrency note:** `validate()` is synchronous and JS is single-threaded, but if
 * callers interleave `await` points between the limit check and subsequent actions,
 * they should serialize calls to `validate()` themselves to preserve the budget invariant.
 */
export interface Clearance {
  /** The agent identifier this clearance was issued for */
  readonly agent: string
  /** The permission scope */
  readonly permissions: Permissions
  /**
   * Read-only view of cumulative spend per token (keys are uppercased).
   * Reflects all tokens that have been passed to `validate()`, including
   * tokens without an explicit limit (for audit purposes).
   */
  readonly spentAmounts: Readonly<Record<string, bigint>>
  /**
   * Pure permission check — same logic as `validate()` but does NOT accumulate spend.
   * Safe for dry-run / UI preview use cases.
   *
   * @throws Error if expired, action/contract not allowed, or spend would exceed limit
   */
  check(call: AgentCall): void
  /**
   * Stateful permission check — verifies the call is allowed AND accumulates spend.
   * Call this when actually committing an agent action (not for previews).
   *
   * @throws Error if expired, action/contract not allowed, or cumulative spend exceeds limit
   */
  validate(call: AgentCall): void
  /**
   * Check whether this clearance has expired.
   *
   * @returns `true` if `now >= createdAt + expiry * 1000ms`
   */
  isExpired(): boolean
}

/**
 * Create a Clearance with a given permission scope.
 *
 * Like issuing a scoped access token: the agent can only do what the
 * permissions allow, and the token expires after `expiry` seconds.
 *
 * @param options - ClearanceOptions with agent ID and permissions
 * @param internalOpts - Clock injection for testing only. Not for production use.
 * @internal
 * @returns A Clearance object with `check`, `validate`, and `isExpired` methods
 *
 * @example
 * ```ts
 * const clearance = createClearance({
 *   agent: '0xagentAddress',
 *   permissions: {
 *     allowedContracts: ['0xUniswapV3Router'],
 *     allowedActions: ['swap'],
 *     spendLimit: { ETH: 1_000_000_000_000_000_000n }, // 1 ETH cumulative max
 *     expiry: 86400, // 24 hours
 *   },
 * })
 *
 * clearance.check({ action: 'swap', contract: '0xUniswapV3Router' })  // pure — no side effect
 * clearance.validate({ action: 'swap', contract: '0xUniswapV3Router' }) // commits spend
 * ```
 */
export function createClearance(
  options: ClearanceOptions,
  { now = Date.now }: { now?: () => number } = {}
): Clearance {
  const createdAt = now()
  const { permissions } = options

  // Pre-compute O(1) lookup sets. Contract addresses are lowercased for
  // case-insensitive comparison (EVM addresses are checksummed but functionally identical).
  const actionsSet = new Set(permissions.allowedActions)
  const contractsSet = new Set(permissions.allowedContracts.map((c) => c.toLowerCase()))

  // Normalize spendLimit keys to uppercase for case-insensitive token matching.
  // e.g. { eth: 1n } and { ETH: 1n } both resolve to the same limit.
  const normalizedSpendLimit: Record<string, bigint> = {}
  for (const [token, limit] of Object.entries(permissions.spendLimit)) {
    normalizedSpendLimit[token.toUpperCase()] = limit
  }

  // Cumulative spend per token (uppercased keys) across all validate() calls.
  // Includes all tokens passed to validate(), even those without explicit limits.
  const spentAmounts: Record<string, bigint> = {}

  /**
   * Pure validation of all permission constraints, given the current spend state.
   * Throws on any violation. Has no side effects.
   */
  function assertPermitted(call: AgentCall, currentSpent: Readonly<Record<string, bigint>>): void {
    if (now() >= createdAt + permissions.expiry * 1000) {
      throw new Error(`Clearance for agent "${options.agent}" has expired`)
    }
    if (!actionsSet.has(call.action)) {
      throw new Error(`Action "${call.action}" not in allowedActions`)
    }
    if (!contractsSet.has(call.contract.toLowerCase())) {
      throw new Error(`Contract "${call.contract}" not in allowedContracts`)
    }
    if (call.spend !== undefined) {
      const { token, amount } = call.spend
      if (amount < 0n) {
        throw new Error(`Spend amount must be non-negative, got ${amount}`)
      }
      const normalizedToken = token.toUpperCase()
      const limit = normalizedSpendLimit[normalizedToken]
      if (limit !== undefined) {
        const soFar = currentSpent[normalizedToken] ?? 0n
        const total = soFar + amount
        if (total > limit) {
          throw new Error(
            `Cumulative spend of ${total} for "${token}" exceeds limit ${limit}`
          )
        }
      }
    }
  }

  return {
    agent: options.agent,
    permissions,

    get spentAmounts(): Readonly<Record<string, bigint>> {
      // Return a shallow copy so callers cannot mutate the internal accumulator.
      return { ...spentAmounts }
    },

    check(call: AgentCall): void {
      assertPermitted(call, spentAmounts)
    },

    validate(call: AgentCall): void {
      assertPermitted(call, spentAmounts)
      // Accumulate spend for all tokens (not only limited ones) for a complete audit trail.
      if (call.spend !== undefined) {
        const normalizedToken = call.spend.token.toUpperCase()
        spentAmounts[normalizedToken] = (spentAmounts[normalizedToken] ?? 0n) + call.spend.amount
      }
    },

    isExpired(): boolean {
      return now() >= createdAt + permissions.expiry * 1000
    },
  }
}
