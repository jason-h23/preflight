/**
 * On-chain assertion utilities for verifying EVM state changes.
 *
 * Like a bank statement auditor: compare the "before" and "after" snapshots
 * to verify that the expected changes occurred, and nothing unexpected happened.
 */

/** A snapshot of on-chain state at a specific block. */
export interface OnChainSnapshot {
  readonly balances: Readonly<Record<string, Readonly<Record<string, bigint>>>>
  readonly blockNumber: bigint
}

/** Context for on-chain assertions — before/after snapshots plus metadata. */
export interface AssertContext {
  readonly snapshots: {
    readonly before: OnChainSnapshot
    readonly after: OnChainSnapshot
  }
  readonly gasUsed: bigint
  readonly approvals: readonly string[]
}

/**
 * Chainable asserter for verifying on-chain state changes.
 *
 * Every method returns `this` so assertions can be chained:
 * ```ts
 * assertOnChain(ctx)
 *   .balanceDecreased('ETH', { address: '0xabc', by: 2_000n })
 *   .gasUsed({ max: 300_000n })
 *   .noUnexpectedApprovals()
 * ```
 */
export class OnChainAsserter {
  private readonly ctx: AssertContext

  constructor(ctx: AssertContext) {
    this.ctx = ctx
  }

  /**
   * Assert that a token balance decreased by at least the specified amount.
   * @param token - Token symbol or address
   * @param opts.address - The address to check
   * @param opts.by - Expected decrease amount (bigint)
   */
  balanceDecreased(
    token: string,
    opts: { readonly address: string; readonly by: bigint }
  ): this {
    const before =
      this.ctx.snapshots.before.balances[opts.address]?.[token] ?? 0n
    const after =
      this.ctx.snapshots.after.balances[opts.address]?.[token] ?? 0n
    const actual = before - after

    if (actual < opts.by) {
      throw new Error(
        `Expected ${token} balance to decrease by ${opts.by}, but decreased by ${actual}`
      )
    }

    return this
  }

  /**
   * Assert that a token balance increased by at least the specified minimum.
   * @param token - Token symbol or address
   * @param opts.address - The address to check
   * @param opts.min - Minimum expected increase (bigint)
   */
  balanceIncreased(
    token: string,
    opts: { readonly address: string; readonly min: bigint }
  ): this {
    const before =
      this.ctx.snapshots.before.balances[opts.address]?.[token] ?? 0n
    const after =
      this.ctx.snapshots.after.balances[opts.address]?.[token] ?? 0n
    const actual = after - before

    if (actual < opts.min) {
      throw new Error(
        `Expected ${token} balance to increase by at least ${opts.min}, but increased by ${actual}`
      )
    }

    return this
  }

  /**
   * Assert that gas used does not exceed the specified maximum.
   * @param opts.max - Maximum allowed gas (bigint)
   */
  gasUsed(opts: { readonly max: bigint }): this {
    if (this.ctx.gasUsed > opts.max) {
      throw new Error(
        `Expected gas used to be at most ${opts.max}, but was ${this.ctx.gasUsed}`
      )
    }

    return this
  }

  /**
   * Assert that no unexpected token approvals occurred.
   * Throws if the approvals array is non-empty.
   */
  noUnexpectedApprovals(): this {
    if (this.ctx.approvals.length > 0) {
      throw new Error(
        `Expected no unexpected approvals, but found: ${this.ctx.approvals.join(', ')}`
      )
    }

    return this
  }
}

/**
 * Factory function to create an on-chain asserter.
 * @param ctx - The assertion context with before/after snapshots
 * @returns A chainable OnChainAsserter instance
 */
export function assertOnChain(ctx: AssertContext): OnChainAsserter {
  return new OnChainAsserter(ctx)
}
