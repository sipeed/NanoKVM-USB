import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const appDir = fileURLToPath(new URL('.', import.meta.url))
const rootPackage = JSON.parse(readFileSync(resolve(appDir, '../../package.json'), 'utf-8'))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackage.version)
  },
  resolve: {
    alias: {
      '@nanokvm/core': resolve(appDir, '../../packages/core/src'),
      '@nanokvm/ui': resolve(appDir, '../../packages/ui/src'),
      '@': resolve(appDir, '../../packages/ui/src')
    }
  },
  server: {
    port: 3001
  },
  build: {
    chunkSizeWarningLimit: 2048
  }
})
