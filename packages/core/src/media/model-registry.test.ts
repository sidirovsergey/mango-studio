import { describe, it, expect } from 'vitest'
import {
  ECONOMY_MODELS,
  PREMIUM_MODELS,
  getDefaultModel,
  getActiveModels,
  getEditModel,
  isModelInTier,
} from './model-registry'

describe('model-registry', () => {
  it('Эконом default = nano-banana-2', () => {
    expect(getDefaultModel('economy')).toBe('fal-ai/nano-banana-2')
  })
  it('Премиум default = nano-banana-pro', () => {
    expect(getDefaultModel('premium')).toBe('fal-ai/nano-banana-pro')
  })
  it('getActiveModels(economy) включает default + alternatives', () => {
    const list = getActiveModels('economy')
    expect(list[0]).toBe('fal-ai/nano-banana-2')
    expect(list).toContain('fal-ai/flux/schnell')
    expect(list.length).toBeGreaterThanOrEqual(4)
  })
  it('getEditModel мапит text→edit для nano-banana', () => {
    expect(getEditModel('fal-ai/nano-banana-2')).toBe('fal-ai/nano-banana-2/edit')
    expect(getEditModel('fal-ai/nano-banana-pro')).toBe('fal-ai/nano-banana-pro/edit')
  })
  it('getEditModel вернёт null для модели без edit-варианта', () => {
    expect(getEditModel('fal-ai/flux/schnell')).toBeNull()
  })
  it('isModelInTier распознаёт принадлежность', () => {
    expect(isModelInTier('fal-ai/nano-banana-2', 'economy')).toBe(true)
    expect(isModelInTier('fal-ai/nano-banana-2', 'premium')).toBe(false)
    expect(isModelInTier('fal-ai/flux-2-pro', 'premium')).toBe(true)
  })
  it('ECONOMY_MODELS и PREMIUM_MODELS не пересекаются', () => {
    const eco = new Set<string>([ECONOMY_MODELS.default, ...ECONOMY_MODELS.alternatives])
    const pro = new Set<string>([PREMIUM_MODELS.default, ...PREMIUM_MODELS.alternatives])
    for (const m of eco) expect(pro.has(m)).toBe(false)
  })
})
