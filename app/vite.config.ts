import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5273 },
  // Served from https://shaurya-m002.github.io/noctis/ in CI, from / locally.
  base: process.env.PAGES_BASE ?? '/',
})
