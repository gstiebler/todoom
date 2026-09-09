/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/todoom/',
  test: {
    include: ['src/**/*.test.ts'],
    environmentMatchGlobs: [
      ['src/ui/**', 'jsdom'],
      ['src/app/session.test.ts', 'jsdom'],
      ['**', 'node'],
    ],
    setupFiles: ['./test/jsdom-storage.ts'],
  },
})
