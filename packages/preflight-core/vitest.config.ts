import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Run test files sequentially to avoid RPC rate limiting
    // (multiple Anvil forks hitting the same free RPC endpoint concurrently)
    fileParallelism: false,
  },
})
