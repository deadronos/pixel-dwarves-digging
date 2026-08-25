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
})
