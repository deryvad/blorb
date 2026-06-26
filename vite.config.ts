import { defineConfig } from 'vite'

// Vite config tuned to play nicely with Tauri (fixed dev port, no screen clear).
export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
})
