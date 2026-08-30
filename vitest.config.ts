import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { join } from 'path'

export default defineConfig({
  plugins: [react() as any],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      include: ['lib/**', 'components/**', 'pages/**', 'scripts/check-diff-coverage.mjs'],
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@': join(__dirname, './'),
    },
  },
})
