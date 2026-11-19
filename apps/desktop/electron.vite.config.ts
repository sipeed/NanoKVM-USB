import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@nanokvm/core': resolve('../../packages/core/src'),
        '@nanokvm/ui': resolve('../../packages/ui/src'),
        '@': resolve('../../packages/ui/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
