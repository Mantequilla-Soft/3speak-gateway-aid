import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Read ports from environment or use defaults
const VITE_PORT = parseInt(process.env.VITE_PORT || '3000', 10)
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '3005', 10)
const WEBSOCKET_PORT = parseInt(process.env.WEBSOCKET_PORT || '3002', 10)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: VITE_PORT,
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
        timeout: 30000 // Increased timeout to handle slow startup
      },
      '/ws': {
        target: `ws://localhost:${WEBSOCKET_PORT}`,
        ws: true
      }
    }
  }
})