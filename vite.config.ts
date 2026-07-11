import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const openFheTarget = process.env.VITE_OPENFHE_PROXY_TARGET || 'http://localhost:8088'

export default defineConfig({
  base: '/data-catalog/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      ignored: ['**/docker/storage/**', '**/openfhe-service/**/__pycache__/**'],
    },
    proxy: {
      '/openfhe-api': {
        target: openFheTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openfhe-api/, ''),
      },
      '/homomorphic-engine-api': {
        target: openFheTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/homomorphic-engine-api/, ''),
      },
      '/data-catalog/homomorphic-engine-api': {
        target: openFheTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/data-catalog\/homomorphic-engine-api/, ''),
      },
      '/api': {
        target: 'http://localhost:8196',
        changeOrigin: true,
      },
      '/storage/uploads': {
        target: 'http://localhost:8196',
        changeOrigin: true,
      },
      '/data-catalog-manage/api': {
        target: 'http://localhost:8196',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/data-catalog-manage/, ''),
      },
    },
  },
})
