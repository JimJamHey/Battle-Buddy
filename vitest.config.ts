import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    include: ['src/core/**/*.test.ts', 'src/ui/**/*.test.ts', 'src/platform/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@core': resolve('src/core')
    }
  }
})
