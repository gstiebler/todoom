import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        fixture: 'e2e/fixture.html',
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts?(x)', 'worker/**/*.test.ts'],
    // Vitest 4 dropped environmentMatchGlobs; the files that need a DOM say so
    // themselves with a `@vitest-environment jsdom` docblock.
    environment: 'node',
    setupFiles: ['./test/jsdom-storage.ts'],
  },
})
