import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { join } from 'path'

export default defineConfig({
  plugins: [react() as any],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
  },
  resolve: {
    alias: {
      '@': join(__dirname, './'),
    },
  },
})
