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
    // Node 20+'s experimental global Web Storage API (unflagged as of
    // Node 26) shadows the working `localStorage`/`sessionStorage` that
    // jsdom installs on `window`, leaving both undefined. Disabling it for
    // the test workers restores jsdom's implementation.
    poolOptions: {
      threads: { execArgv: ['--no-experimental-webstorage'] },
      forks: { execArgv: ['--no-experimental-webstorage'] },
    },
  },
})
