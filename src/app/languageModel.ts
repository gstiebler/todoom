export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

export interface ModelSession {
  prompt(text: string): Promise<string>
  destroy(): void
}

export interface LanguageModelAdapter {
  availability(): Promise<Availability>
  /** Creates a session; `onProgress` gets 0..1 while the model downloads. */
  create(system: string, onProgress: (fraction: number) => void): Promise<ModelSession>
}

// The Prompt API as Chrome ships it; only the parts used here.
interface ChromeSession {
  prompt(input: string): Promise<string>
  destroy(): void
}

interface ChromeLanguageModel {
  availability(): Promise<Availability>
  create(options: {
    initialPrompts: Array<{ role: 'system'; content: string }>
    temperature: number
    topK: number
    monitor(monitor: EventTarget): void
  }): Promise<ChromeSession>
}

declare global {
  var LanguageModel: ChromeLanguageModel | undefined
}

/** Chrome's built-in model; reports `unavailable` in every other browser. */
export const chromeModel: LanguageModelAdapter = {
  async availability() {
    return globalThis.LanguageModel ? globalThis.LanguageModel.availability() : 'unavailable'
  },

  async create(system, onProgress) {
    const model = globalThis.LanguageModel
    if (!model) throw new Error('no on-device model')
    return model.create({
      initialPrompts: [{ role: 'system', content: system }],
      temperature: 0,
      topK: 1,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          onProgress((event as ProgressEvent).loaded)
        })
      },
    })
  },
}
