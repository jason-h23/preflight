/**
 * EVMbench integration utilities.
 *
 * Parses EVMbench security scan findings and generates preflight-compatible
 * Permissions that exclude vulnerable contracts.
 */

/** Severity levels from EVMbench scan results, ordered lowest to highest. */
export type EvmbenchSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

const SEVERITY_ORDER: readonly EvmbenchSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

/** A single EVMbench vulnerability finding. */
export interface EvmbenchFinding {
  readonly address: string
  readonly severity: EvmbenchSeverity
  readonly category: string
  readonly description: string
}

/** The full EVMbench scan report. */
export interface EvmbenchReport {
  readonly findings: readonly EvmbenchFinding[]
  readonly scannedAt: string
  readonly chainId: number
}

/** Options for filtering findings by severity threshold. */
export interface EvmbenchFilterOptions {
  /**
   * Minimum severity level to include.
   * Defaults to 'LOW' (include all findings).
   */
  readonly minSeverity?: EvmbenchSeverity
}

/** Parsed result from parseEvmbenchFindings. */
export interface EvmbenchSummary {
  /** Deduplicated addresses with at least one finding at or above the severity threshold. */
  readonly vulnerableAddresses: readonly string[]
  readonly chainId: number
  readonly scannedAt: string
}

/**
 * Parse an EVMbench report and extract vulnerable contract addresses.
 *
 * @param report - EVMbench JSON scan report
 * @param options - Optional severity filter (default: include all)
 * @returns Deduplicated list of vulnerable addresses and scan metadata
 *
 * @example
 * const summary = parseEvmbenchFindings(report, { minSeverity: 'HIGH' })
 * // summary.vulnerableAddresses — contracts with HIGH or CRITICAL findings
 */
export function parseEvmbenchFindings(
  report: EvmbenchReport,
  options: EvmbenchFilterOptions = {},
): EvmbenchSummary {
  const minSeverity = options.minSeverity ?? 'LOW'
  const minIndex = SEVERITY_ORDER.indexOf(minSeverity)
  if (minIndex === -1) throw new Error(`Unknown minSeverity: ${minSeverity}`)

  const seen = new Set<string>()
  for (const finding of report.findings) {
    const idx = SEVERITY_ORDER.indexOf(finding.severity)
    if (idx === -1) throw new Error(`Unknown severity: ${finding.severity}`)
    if (idx >= minIndex) seen.add(finding.address.toLowerCase())
  }

  return {
    vulnerableAddresses: Array.from(seen),
    chainId: report.chainId,
    scannedAt: report.scannedAt,
  }
}

/** Minimal Permissions shape for EVMbench-filtered contract lists. */
export interface EvmbenchPermissions {
  readonly allowedContracts: readonly string[]
}

/**
 * Create a Permissions object from a contract list, excluding contracts
 * flagged as vulnerable by EVMbench.
 *
 * @param allContracts - Full list of contracts the agent may interact with
 * @param report - EVMbench scan report
 * @param options - Optional severity filter (default: exclude all findings)
 * @returns Permissions with allowedContracts excluding vulnerable addresses
 *
 * @example
 * const permissions = createPermissionsFromEvmbench(
 *   [uniswapRouter, aavePool],
 *   evmbenchReport,
 *   { minSeverity: 'MEDIUM' }
 * )
 * // permissions.allowedContracts — only contracts with no MEDIUM+ findings
 */
export function createPermissionsFromEvmbench(
  allContracts: readonly string[],
  report: EvmbenchReport,
  options: EvmbenchFilterOptions = {},
): EvmbenchPermissions {
  const { vulnerableAddresses } = parseEvmbenchFindings(report, options)
  const blockedSet = new Set(vulnerableAddresses.map(a => a.toLowerCase()))

  return {
    allowedContracts: allContracts.filter(c => !blockedSet.has(c.toLowerCase())),
  }
}
