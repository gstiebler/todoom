/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/todoom/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
