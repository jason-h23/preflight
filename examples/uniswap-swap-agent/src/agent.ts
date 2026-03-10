import { createMockChatModel } from '@preflight/adapter-langchain'
import { mockLLM } from '@preflight/core'

// The allowed scope received by the agent (comes from clearance)
export interface SwapIntent {
  tokenIn: string
  tokenOut: string
  amountIn: bigint
  slippage: number
}

// LLM mock: response for "ETH to USDC swap" prompts
const swapLLM = mockLLM({
  responses: [
    {
      prompt: /swap.*ETH.*USDC/i,
      reply: JSON.stringify({
        action: 'swap',
        tokenIn: 'ETH',
        tokenOut: 'USDC',
        amountIn: '1000000000000000000', // 1 ETH
        slippage: 0.005,
      }),
    },
    {
      prompt: /check.*balance/i,
      reply: JSON.stringify({ action: 'check_balance', token: 'ETH' }),
    },
  ],
})

export const swapChatModel = createMockChatModel(swapLLM)

// Agent runner: parses a user message into a swap intent
export async function runSwapAgent(userMessage: string): Promise<SwapIntent | null> {
  const result = await swapChatModel.invoke([
    { role: 'system', content: 'You are a DeFi swap agent. Return JSON only.' },
    { role: 'user', content: userMessage },
  ])

  try {
    const parsed = JSON.parse(result.content) as Record<string, unknown>
    if (parsed.action !== 'swap') return null
    return {
      tokenIn: parsed.tokenIn as string,
      tokenOut: parsed.tokenOut as string,
      amountIn: BigInt(parsed.amountIn as string),
      slippage: parsed.slippage as number,
    }
  } catch {
    return null
  }
}
