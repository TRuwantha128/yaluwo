import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The API runs on :8080 (backend/). In development Vite forwards /api to it,
// so the login cookie stays on the same address as the website.
const API = process.env.VITE_API_PROXY ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: API, changeOrigin: true, ws: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: API, changeOrigin: true, ws: true } },
  },
})
