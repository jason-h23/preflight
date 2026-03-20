import { describe, it, expect } from 'vitest'
import { createTokamakAgentMock } from './index'
import type { LLMMock } from '@preflight/core'

function makeMock(responses: Array<{ prompt: string | RegExp; reply: string }>): LLMMock {
  return {
    resolve(input: string): string {
      for (const r of responses) {
        if (typeof r.prompt === 'string' && input.includes(r.prompt)) return r.reply
        if (r.prompt instanceof RegExp && r.prompt.test(input)) return r.reply
      }
      throw new Error(`No mock response found for: "${input}"`)
    },
  } as LLMMock
}

describe('createTokamakAgentMock', () => {
  describe('basic creation', () => {
    it('should return an object with a run method', () => {
      const mock = makeMock([{ prompt: /swap/, reply: 'swap ETH on Tokamak' }])
      const agent = createTokamakAgentMock(mock)
      expect(agent).toBeDefined()
      expect(typeof agent.run).toBe('function')
    })
  })

  describe('run', () => {
    it('should return { output } for matching input', async () => {
      const mock = makeMock([{ prompt: /swap/, reply: 'swap ETH on Tokamak' }])
      const agent = createTokamakAgentMock(mock)
      const result = await agent.run('swap 1 ETH')
      expect(result).toEqual({ output: 'swap ETH on Tokamak' })
    })

    it('should support string pattern matching', async () => {
      const mock = makeMock([{ prompt: 'bridge', reply: 'bridge to L2' }])
      const agent = createTokamakAgentMock(mock)
      const result = await agent.run('please bridge my tokens')
      expect(result).toEqual({ output: 'bridge to L2' })
    })

    it('should throw when no pattern matches', async () => {
      const mock = makeMock([{ prompt: /swap/, reply: 'swap ETH' }])
      const agent = createTokamakAgentMock(mock)
      await expect(agent.run('do something unknown')).rejects.toThrow()
    })

    it('should return first matching response when multiple patterns match', async () => {
      const mock = makeMock([
        { prompt: /bridge/, reply: 'first bridge reply' },
        { prompt: /bridge L2/, reply: 'second bridge reply' },
      ])
      const agent = createTokamakAgentMock(mock)
      const result = await agent.run('bridge L2 tokens')
      expect(result.output).toBe('first bridge reply')
    })

    it('should work with Tokamak L2-specific prompts', async () => {
      const mock = makeMock([{ prompt: /TON/, reply: 'stake TON on Tokamak L2' }])
      const agent = createTokamakAgentMock(mock)
      const result = await agent.run('stake my TON')
      expect(result.output).toBe('stake TON on Tokamak L2')
    })
  })

  describe('with empty responses', () => {
    it('should throw when mock has no responses', async () => {
      const mock = makeMock([])
      const agent = createTokamakAgentMock(mock)
      await expect(agent.run('anything')).rejects.toThrow()
    })
  })
})
