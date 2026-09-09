/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/todoom/',
  test: {
    include: ['src/**/*.test.ts'],
    environmentMatchGlobs: [
      ['src/ui/**', 'jsdom'],
      ['**', 'node'],
    ],
  },
})
