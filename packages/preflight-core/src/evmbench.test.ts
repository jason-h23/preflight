import { describe, it, expect } from 'vitest'
import {
  parseEvmbenchFindings,
  createPermissionsFromEvmbench,
} from './evmbench'

const SAFE_CONTRACT = '0x1111111111111111111111111111111111111111' as const
const VULN_HIGH     = '0x2222222222222222222222222222222222222222' as const
const VULN_MEDIUM   = '0x3333333333333333333333333333333333333333' as const
const VULN_LOW      = '0x4444444444444444444444444444444444444444' as const

const mockReport = {
  findings: [
    { address: VULN_HIGH,   severity: 'HIGH',   category: 'reentrancy',       description: 'Reentrancy vulnerability' },
    { address: VULN_MEDIUM, severity: 'MEDIUM', category: 'integer-overflow', description: 'Integer overflow' },
    { address: VULN_LOW,    severity: 'LOW',    category: 'gas-limit',        description: 'Gas limit issue' },
  ],
  scannedAt: '2026-03-12T00:00:00Z',
  chainId: 11155111,
}

describe('parseEvmbenchFindings', () => {
  it('should exist and be a function', () => {
    expect(parseEvmbenchFindings).toBeTypeOf('function')
  })

  it('should return all vulnerability addresses', () => {
    const result = parseEvmbenchFindings(mockReport)
    expect(result.vulnerableAddresses).toHaveLength(3)
    expect(result.vulnerableAddresses).toContain(VULN_HIGH)
    expect(result.vulnerableAddresses).toContain(VULN_MEDIUM)
    expect(result.vulnerableAddresses).toContain(VULN_LOW)
  })

  it('should filter by minimum severity HIGH only', () => {
    const result = parseEvmbenchFindings(mockReport, { minSeverity: 'HIGH' })
    expect(result.vulnerableAddresses).toHaveLength(1)
    expect(result.vulnerableAddresses).toContain(VULN_HIGH)
  })

  it('should filter MEDIUM and above', () => {
    const result = parseEvmbenchFindings(mockReport, { minSeverity: 'MEDIUM' })
    expect(result.vulnerableAddresses).toHaveLength(2)
    expect(result.vulnerableAddresses).toContain(VULN_HIGH)
    expect(result.vulnerableAddresses).toContain(VULN_MEDIUM)
  })

  it('should return empty array for empty findings', () => {
    const result = parseEvmbenchFindings({ ...mockReport, findings: [] })
    expect(result.vulnerableAddresses).toHaveLength(0)
  })

  it('should include chainId in the result', () => {
    const result = parseEvmbenchFindings(mockReport)
    expect(result.chainId).toBe(11155111)
  })

  it('should include CRITICAL severity findings', () => {
    const criticalReport = {
      ...mockReport,
      findings: [
        { address: VULN_HIGH, severity: 'CRITICAL' as const, category: 'critical', description: 'Critical vuln' },
      ],
    }
    const result = parseEvmbenchFindings(criticalReport, { minSeverity: 'CRITICAL' })
    expect(result.vulnerableAddresses).toHaveLength(1)
    expect(result.vulnerableAddresses).toContain(VULN_HIGH)
  })

  it('should throw for unknown minSeverity values', () => {
    expect(() =>
      parseEvmbenchFindings(mockReport, {
        minSeverity: 'INFORMATIONAL' as unknown as 'HIGH',
      })
    ).toThrow('Unknown minSeverity: INFORMATIONAL')
  })

  it('should throw for unknown severity values', () => {
    const badReport = {
      ...mockReport,
      findings: [
        { address: VULN_HIGH, severity: 'HIGHT' as unknown as 'HIGH', category: 'oops', description: 'Typo' },
      ],
    }
    expect(() => parseEvmbenchFindings(badReport)).toThrow('Unknown severity: HIGHT')
  })

  it('should deduplicate addresses with multiple findings', () => {
    const report = {
      ...mockReport,
      findings: [
        { address: VULN_HIGH, severity: 'HIGH' as const,   category: 'reentrancy', description: 'First' },
        { address: VULN_HIGH, severity: 'MEDIUM' as const, category: 'overflow',   description: 'Second' },
      ],
    }
    const result = parseEvmbenchFindings(report)
    expect(result.vulnerableAddresses).toHaveLength(1)
  })
})

describe('createPermissionsFromEvmbench', () => {
  it('should exist and be a function', () => {
    expect(createPermissionsFromEvmbench).toBeTypeOf('function')
  })

  it('should exclude vulnerable addresses from allowedContracts', () => {
    const allContracts = [SAFE_CONTRACT, VULN_HIGH, VULN_MEDIUM]
    const result = createPermissionsFromEvmbench(allContracts, mockReport)
    expect(result.allowedContracts).toContain(SAFE_CONTRACT)
    expect(result.allowedContracts).not.toContain(VULN_HIGH)
    expect(result.allowedContracts).not.toContain(VULN_MEDIUM)
    expect(result.allowedContracts).not.toContain(VULN_LOW)
  })

  it('should return all contracts when no findings', () => {
    const allContracts = [SAFE_CONTRACT, VULN_HIGH]
    const emptyReport = { ...mockReport, findings: [] }
    const result = createPermissionsFromEvmbench(allContracts, emptyReport)
    expect(result.allowedContracts).toHaveLength(2)
  })

  it('should filter only HIGH severity when minSeverity is HIGH', () => {
    const allContracts = [SAFE_CONTRACT, VULN_HIGH, VULN_MEDIUM]
    const result = createPermissionsFromEvmbench(allContracts, mockReport, { minSeverity: 'HIGH' })
    expect(result.allowedContracts).toContain(SAFE_CONTRACT)
    expect(result.allowedContracts).toContain(VULN_MEDIUM)
    expect(result.allowedContracts).not.toContain(VULN_HIGH)
  })

  it('should match regardless of address casing (checksum addresses)', () => {
    // Use an address with a-f hex letters so toUpperCase() actually changes the casing
    const VULN_WITH_ALPHA = '0xabcdef1234567890abcdef1234567890abcdef12'
    const checksumAddr    = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'
    const report = {
      ...mockReport,
      findings: [
        { address: VULN_WITH_ALPHA, severity: 'HIGH' as const, category: 'reentrancy', description: 'test' },
      ],
    }
    const result = createPermissionsFromEvmbench([checksumAddr, SAFE_CONTRACT], report)
    expect(result.allowedContracts).toContain(SAFE_CONTRACT)
    expect(result.allowedContracts).not.toContain(checksumAddr)
  })

  it('should return readonly allowedContracts array', () => {
    const result = createPermissionsFromEvmbench([SAFE_CONTRACT], mockReport)
    expect(Array.isArray(result.allowedContracts)).toBe(true)
  })
})
