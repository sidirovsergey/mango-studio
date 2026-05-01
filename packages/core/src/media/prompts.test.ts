import { describe, it, expect } from 'vitest'
import { buildAvatarPrompt, buildDossierPrompt } from './prompts'

const baseChar = {
  name: 'Дэнни',
  description: 'Оптимистичный дельфин',
  appearance: {
    species: 'дельфин',
    age: '8 лет',
    distinctive: ['веснушки', 'круглые очки'],
  },
  personality: 'добрый и любопытный',
}

describe('buildAvatarPrompt', () => {
  it('содержит ключевые слова портрета', () => {
    const out = buildAvatarPrompt(baseChar, '3d_pixar')
    expect(out.toLowerCase()).toContain('портрет')
    expect(out.toLowerCase()).toContain('лицо')
    expect(out).toContain('1:1')
  })
  it('инжектит name, description и appearance', () => {
    const out = buildAvatarPrompt(baseChar, '3d_pixar')
    expect(out).toContain('Дэнни')
    expect(out).toContain('Оптимистичный дельфин')
    expect(out).toContain('дельфин')
    expect(out).toContain('веснушки')
  })
  it('применяет стиль 3d_pixar', () => {
    const out = buildAvatarPrompt(baseChar, '3d_pixar')
    expect(out).toMatch(/3D Pixar/i)
  })
  it('применяет стиль 2d_drawn', () => {
    const out = buildAvatarPrompt(baseChar, '2d_drawn')
    expect(out).toMatch(/2D рисованная/i)
  })
  it('применяет стиль clay_art', () => {
    const out = buildAvatarPrompt(baseChar, 'clay_art')
    expect(out).toMatch(/пластилина/i)
  })
  it('опускает personality если её нет', () => {
    const out = buildAvatarPrompt({ ...baseChar, personality: undefined }, '3d_pixar')
    expect(out).not.toMatch(/Характер:/)
  })
  it('не пустой', () => {
    const out = buildAvatarPrompt(baseChar, '3d_pixar')
    expect(out.trim().length).toBeGreaterThan(50)
  })
})

describe('buildDossierPrompt', () => {
  it('включает фиксированные правила model-sheet pattern', () => {
    const out = buildDossierPrompt(baseChar, '3d_pixar')
    expect(out).toContain('ЧИСТО БЕЛОМ фоне')
    expect(out).toContain('Несколько выражений лица')
    expect(out).toContain('Несколько поз тела')
    expect(out).toContain('16:9')
  })
  it('инжектит description, appearance и name', () => {
    const out = buildDossierPrompt(baseChar, '3d_pixar')
    expect(out).toContain('Дэнни')
    expect(out).toContain('Оптимистичный дельфин')
    expect(out).toContain('дельфин')
    expect(out).toContain('веснушки')
  })
  it('применяет 3d_pixar style preamble', () => {
    const out = buildDossierPrompt(baseChar, '3d_pixar')
    expect(out).toMatch(/3D Pixar/i)
  })
  it('применяет 2d_drawn style preamble', () => {
    const out = buildDossierPrompt(baseChar, '2d_drawn')
    expect(out).toMatch(/2D рисованная/i)
  })
  it('применяет clay_art style preamble', () => {
    const out = buildDossierPrompt(baseChar, 'clay_art')
    expect(out).toMatch(/пластилина/i)
  })
  it('опускает personality секцию если её нет', () => {
    const out = buildDossierPrompt({ ...baseChar, personality: undefined }, '3d_pixar')
    expect(out).not.toMatch(/Характер:/)
  })
})
