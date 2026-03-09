import { describe, it, expect } from 'vitest'
import { mockLLM, createMockOpenAI } from './mock-llm'

describe('mockLLM', () => {
  it('should return mocked response for a regex-matching prompt', async () => {
    const mock = mockLLM({
      responses: [{ prompt: /swap/, reply: 'swap 1 ETH for USDC' }],
    })
    const openai = createMockOpenAI(mock)
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'please swap my tokens' }],
    })
    expect(result.choices[0].message.content).toBe('swap 1 ETH for USDC')
  })

  it('should return mocked response for a string-matching prompt', async () => {
    const mock = mockLLM({
      responses: [{ prompt: 'transfer', reply: 'transfer 0.5 ETH to 0xabc' }],
    })
    const openai = createMockOpenAI(mock)
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'please transfer ETH' }],
    })
    expect(result.choices[0].message.content).toBe('transfer 0.5 ETH to 0xabc')
  })

  it('should use the last message as the prompt', async () => {
    const mock = mockLLM({
      responses: [{ prompt: /approve/, reply: 'approve USDC' }],
    })
    const openai = createMockOpenAI(mock)
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
        { role: 'user', content: 'please approve the token' },
      ],
    })
    expect(result.choices[0].message.content).toBe('approve USDC')
  })

  it('should throw for unmatched prompt with the prompt content in the error', async () => {
    const mock = mockLLM({ responses: [] })
    const openai = createMockOpenAI(mock)

    await expect(
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'do something unmatched' }],
      })
    ).rejects.toThrow('No mock response found for: "do something unmatched"')
  })

  it('should throw a specific error when messages array is empty', async () => {
    const mock = mockLLM({ responses: [] })
    const openai = createMockOpenAI(mock)

    await expect(
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [],
      })
    ).rejects.toThrow('createMockOpenAI: messages array must not be empty')
  })

  it('should match the first matching response when multiple patterns exist', async () => {
    const mock = mockLLM({
      responses: [
        { prompt: /swap/, reply: 'first swap reply' },
        { prompt: /swap ETH/, reply: 'second swap reply' },
      ],
    })
    const openai = createMockOpenAI(mock)
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'swap ETH for USDC' }],
    })
    expect(result.choices[0].message.content).toBe('first swap reply')
  })
})
