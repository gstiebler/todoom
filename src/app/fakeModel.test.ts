import { describe, expect, test } from 'vitest'
import { FakeModel } from './fakeModel'

describe('FakeModel', () => {
  test('answers in order, reports progress and remembers what it was asked', async () => {
    const model = new FakeModel('available', ['+home', 'done'], [0.5, 1])
    const seen: number[] = []
    const session = await model.create('system', (fraction) => seen.push(fraction))
    expect(seen).toEqual([0.5, 1])
    expect(model.systemPrompt).toBe('system')
    expect(await session.prompt('home stuff')).toBe('+home')
    expect(await session.prompt('finished')).toBe('done')
    expect(model.prompts).toEqual(['home stuff', 'finished'])
    await expect(session.prompt('again')).rejects.toThrow('no answer scripted')
  })

  test('rejects create when told to', async () => {
    const model = new FakeModel()
    model.failCreate = new Error('declined')
    await expect(model.create('s', () => {})).rejects.toThrow('declined')
  })
})
