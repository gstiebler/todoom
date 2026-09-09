/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/todoom/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        fixture: 'e2e/fixture.html',
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environmentMatchGlobs: [
      ['src/ui/**', 'jsdom'],
      ['src/app/session.test.ts', 'jsdom'],
      ['src/app/urlHistory.test.ts', 'jsdom'],
      ['**', 'node'],
    ],
    setupFiles: ['./test/jsdom-storage.ts'],
  },
})
