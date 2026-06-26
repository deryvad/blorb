import { defineConfig } from 'vite'

// Vite config tuned to play nicely with Tauri (fixed dev port, no screen clear).
export default defineConfig({
  // Relative asset paths so the build runs from any sub-path — itch.io (served
  // in an iframe from a sub-folder), GitHub Pages, and the Tauri asset protocol.
  base: './',
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
