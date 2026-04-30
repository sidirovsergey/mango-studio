import { describe, it, expect } from 'vitest'
import { buildScriptPrompt } from './prompts'

describe('buildScriptPrompt с existingCharacters', () => {
  const baseInput = {
    user_prompt: 'idea',
    duration_sec: 30,
    format: '9:16' as const,
    style: '3d_pixar' as const,
  }

  it('без ctx — first-generation hint', () => {
    const out = buildScriptPrompt(baseInput)
    expect(out).toMatch(/первая генерация|action.*add/i)
    expect(out).not.toMatch(/СУЩЕСТВУЮЩИЕ ПЕРСОНАЖИ/)
  })

  it('с ctx — инжектит existing block + keep/add/remove rules', () => {
    const out = buildScriptPrompt(baseInput, {
      existingCharacters: [
        { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Дэнни', description: 'дельфин' },
      ],
    })
    expect(out).toContain('СУЩЕСТВУЮЩИЕ ПЕРСОНАЖИ')
    expect(out).toContain('550e8400-e29b-41d4-a716-446655440000')
    expect(out).toMatch(/keep/)
    expect(out).toMatch(/add/)
    expect(out).toMatch(/remove/)
  })
})
