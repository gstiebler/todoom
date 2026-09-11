import type { Availability, LanguageModelAdapter, ModelSession } from './languageModel'

/** A scripted model for tests: answers come from a list, in order. */
export class FakeModel implements LanguageModelAdapter {
  systemPrompt: string | null = null
  prompts: string[] = []
  sessions = 0
  failCreate: Error | null = null

  constructor(
    private status: Availability = 'available',
    private answers: string[] = [],
    private progress: number[] = [],
  ) {}

  async availability(): Promise<Availability> {
    return this.status
  }

  async create(system: string, onProgress: (fraction: number) => void): Promise<ModelSession> {
    if (this.failCreate) throw this.failCreate
    this.sessions += 1
    this.systemPrompt = system
    for (const fraction of this.progress) onProgress(fraction)
    return {
      prompt: async (text) => {
        this.prompts.push(text)
        const answer = this.answers.shift()
        if (answer === undefined) throw new Error('no answer scripted')
        return answer
      },
      destroy: () => {},
    }
  }
}
