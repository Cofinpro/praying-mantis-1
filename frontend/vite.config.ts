import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Tests run in Lisbon time, so local → UTC conversions give the same result on every machine and in CI.
// Set here, before Vitest starts its workers, because Node reads TZ when a process starts.
process.env.TZ = 'Europe/Lisbon'

// https://vite.dev/config/
// Vitest reads this same file, so tests use the same plugins and module resolution as the app.
export default defineConfig({
  plugins: [react()],
  test: {
    // A simulated DOM in Node: fast, but no layout or real CSS, so tests check roles and text, not pixels.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
