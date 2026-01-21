import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth/google': 'http://localhost:3000'
    },
    host: true // Allow network access for mobile testing
  }
})
