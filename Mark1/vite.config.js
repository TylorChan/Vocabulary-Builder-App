import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
      react(),
      compression({
        algorithm: "gzip", 
        ext: ".gz", 
        threshold: 10240, 
        deleteOriginFile: false, 
        filter: /\.(js|css|json|html|ico|svg)(\?.*)?$/i,
        compressionOptions: { level: 9 }, 
        verbose: true, 
        disable: false,
      })
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        sidepanel: "sidepanel.html",
      },
    },
    // minify: false,
    // ✅ version: minify with esbuild
    minify: 'esbuild',
    // Copy manifest and content script to dist on every build
    emptyOutDir: true,
  }
})
