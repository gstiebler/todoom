/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        fixture: 'e2e/fixture.html',
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    environmentMatchGlobs: [
      ['src/ui/**', 'jsdom'],
      ['src/app/session.test.ts', 'jsdom'],
      ['src/app/urlHistory.test.ts', 'jsdom'],
      ['**', 'node'],
    ],
    setupFiles: ['./test/jsdom-storage.ts'],
  },
})
