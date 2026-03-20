/**
 * @preflight/core — AI agent behavioral testing framework for EVM.
 *
 * Re-exports all public APIs from sub-modules.
 */

// Fork environment
export { createFork } from './fork'
export type { Fork, ForkOptions } from './fork'

// Scenario API
export { preflight, scenario } from './scenario'
export type { Scenario, ScenarioContext, ScenarioOptions } from './scenario'

// On-chain assertions
export { assertOnChain, OnChainAsserter } from './assert'
export type { AssertContext, OnChainSnapshot } from './assert'

// Live testnet fork
export { createLiveFork } from './live-fork'
export type { LiveFork, LiveForkOptions } from './live-fork'

// LLM mocking
export { mockLLM, createMockOpenAI } from './mock-llm'
export type {
  LLMMock,
  MockLLMOptions,
  MockResponse,
  MockOpenAIClient,
  ChatCompletionParams,
  ChatCompletionResponse,
} from './mock-llm'

// EVMbench integration
export {
  parseEvmbenchFindings,
  createPermissionsFromEvmbench,
} from './evmbench'
export type {
  EvmbenchSeverity,
  EvmbenchFinding,
  EvmbenchReport,
  EvmbenchFilterOptions,
  EvmbenchSummary,
  EvmbenchPermissions,
} from './evmbench'
