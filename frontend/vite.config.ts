import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The backend runs on :8000; proxying keeps everything same-origin in development,
    // which is also what the Strava OAuth redirect URI expects.
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    environment: 'node',
  },
})
