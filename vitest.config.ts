import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { join } from 'path'
import { COVERAGE_INCLUDE } from './scripts/tracked-files.mjs'

export default defineConfig({
  plugins: [react() as any],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      include: COVERAGE_INCLUDE,
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@': join(__dirname, './'),
    },
  },
})
