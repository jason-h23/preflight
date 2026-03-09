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
 *   .balanceDecreased('ETH', { address: '0xabc', min: 2_000n })
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
   * Shared implementation for balance change assertions.
   *
   * @param direction - `'decreased'` computes `before - after`; `'increased'` computes `after - before`
   * @param token - Token symbol or address
   * @param opts.address - The address to check (must exist in both snapshots)
   * @param opts.min - Minimum expected change amount (bigint, inclusive)
   */
  private assertBalanceChange(
    direction: 'decrease' | 'increase',
    token: string,
    opts: { readonly address: string; readonly min: bigint }
  ): void {
    if (
      !Object.hasOwn(this.ctx.snapshots.before.balances, opts.address) ||
      !Object.hasOwn(this.ctx.snapshots.after.balances, opts.address)
    ) {
      throw new Error(`Address "${opts.address}" not found in snapshots`)
    }

    // Non-null assertion is safe: Object.hasOwn verified presence above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const before = this.ctx.snapshots.before.balances[opts.address]![token] ?? 0n
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const after = this.ctx.snapshots.after.balances[opts.address]![token] ?? 0n
    const actual = direction === 'decrease' ? before - after : after - before

    if (actual < opts.min) {
      const opposite = direction === 'decrease' ? 'increased' : 'decreased'
      if (actual < 0n) {
        throw new Error(
          `Expected ${token} balance to ${direction} by at least ${opts.min}, but balance ${opposite} by ${-actual}`
        )
      }
      throw new Error(
        `Expected ${token} balance to ${direction} by at least ${opts.min}, but ${direction}d by ${actual}`
      )
    }
  }

  /**
   * Assert that a token balance decreased by at least the specified minimum.
   * Passes if `before - after >= min`.
   *
   * @param token - Token symbol or address
   * @param opts.address - The address to check (must exist in both snapshots)
   * @param opts.min - Minimum expected decrease amount (bigint, inclusive)
   */
  balanceDecreased(
    token: string,
    opts: { readonly address: string; readonly min: bigint }
  ): this {
    this.assertBalanceChange('decrease', token, opts)
    return this
  }

  /**
   * Assert that a token balance increased by at least the specified minimum.
   * Passes if `after - before >= min`.
   *
   * @param token - Token symbol or address
   * @param opts.address - The address to check (must exist in both snapshots)
   * @param opts.min - Minimum expected increase amount (bigint, inclusive)
   */
  balanceIncreased(
    token: string,
    opts: { readonly address: string; readonly min: bigint }
  ): this {
    this.assertBalanceChange('increase', token, opts)
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
