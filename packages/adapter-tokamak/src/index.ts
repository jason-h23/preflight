/**
 * Tokamak AI Layer adapter for preflight.
 *
 * Like a Tokamak AI Layer agent stand-in: instead of calling the real
 * Tokamak agent runtime, return deterministic output from a mockLLM instance.
 */
import type { LLMMock } from '@preflight/core'

/** Result of a mock Tokamak agent run */
export interface MockTokamakRunResult {
  readonly output: string
}

/**
 * A minimal mock Tokamak AI Layer-compatible agent client.
 *
 * Provides a `run(input)` method that resolves input against mockLLM rules,
 * mimicking the core agent execution pattern of the Tokamak AI Layer SDK.
 */
export interface MockTokamakAgentClient {
  readonly run: (input: string) => Promise<MockTokamakRunResult>
}

/**
 * Create a mock Tokamak AI Layer-compatible agent client backed by an LLMMock.
 *
 * @param mock - LLMMock from mockLLM()
 * @returns MockTokamakAgentClient with run() method
 *
 * @example
 * const mock = mockLLM({ responses: [{ prompt: /bridge/, reply: 'bridge to L2' }] })
 * const agent = createTokamakAgentMock(mock)
 * const result = await agent.run('bridge my tokens')
 * // result.output === 'bridge to L2'
 */
export function createTokamakAgentMock(mock: LLMMock): MockTokamakAgentClient {
  return {
    run: async (input: string): Promise<MockTokamakRunResult> => {
      const output = mock.resolve(input)
      return { output }
    },
  }
}
