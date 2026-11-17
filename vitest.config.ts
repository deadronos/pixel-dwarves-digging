import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // The 200-seed liveness sweeps run the real simulation and need the same
    // headroom CI gives them via --testTimeout=30000.
    testTimeout: 30000,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
