import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  base: isGitHubPagesBuild ? '/pixel-dwarves-digging/' : '/',
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three-vendor',
              test: /node_modules[\\/](three|three-stdlib)[\\/]/,
            },
            {
              name: 'r3f-vendor',
              test: /node_modules[\\/]@react-three[\\/]/,
            },
          ],
        },
      },
    },
  },
})
