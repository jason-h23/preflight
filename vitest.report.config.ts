// vitest.config.ts (root — for test:report only, not used by turbo)
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'examples/*/src/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.live.test.ts',
    ],
    reporters: ['default', 'html'],
    outputFile: {
      html: 'vitest-report/index.html',
    },
    fileParallelism: false,
  },
})
