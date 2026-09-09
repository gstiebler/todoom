// Node's own experimental Web Storage globals shadow the implementation jsdom
// would otherwise install, leaving `localStorage` unusable inside the jsdom
// test environment. Install a minimal in-memory Storage so the tests exercise
// real behaviour. Doing it here, rather than with a
// `--no-experimental-webstorage` execArgv, keeps the suite runnable on Node 20,
// where that flag does not exist.
class MemoryStorage implements Storage {
  private data = new Map<string, string>()

  get length(): number {
    return this.data.size
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value))
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  clear(): void {
    this.data.clear()
  }
}

if (typeof window !== 'undefined') {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    if (!window[name]) {
      const storage = new MemoryStorage()
      Object.defineProperty(window, name, { value: storage, configurable: true })
      Object.defineProperty(globalThis, name, { value: storage, configurable: true })
    }
  }
}
