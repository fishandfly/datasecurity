import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const securityRuntimeTarget = process.env.VITE_SECURITY_RUNTIME_PROXY_TARGET || 'http://localhost:8090'

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
      '/security-runtime-api': {
        target: securityRuntimeTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/security-runtime-api/, ''),
      },
      '/data-api': {
        target: securityRuntimeTarget,
        changeOrigin: true,
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
