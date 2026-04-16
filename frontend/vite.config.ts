import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Mọi request bắt đầu bằng /api/v1 → forward tới FastAPI
      // changeOrigin: true  → đổi Host header cho backend
      // secure: false       → cho phép HTTPS self-signed cert (nếu cần)
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
