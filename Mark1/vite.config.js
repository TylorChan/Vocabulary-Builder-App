import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
    // Don't minify for easier debugging during development
    minify: false,
    // Copy manifest and content script to dist on every build
    emptyOutDir: true,
  }
})
