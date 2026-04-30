export type Tier = 'economy' | 'premium'

export const ECONOMY_MODELS = {
  default: 'fal-ai/nano-banana-2',
  alternatives: [
    'fal-ai/flux/schnell',
    'fal-ai/recraft/v4/pro/text-to-image',
    'fal-ai/bytedance/seedream/v4.5/edit',
  ],
} as const

export const PREMIUM_MODELS = {
  default: 'fal-ai/nano-banana-pro',
  alternatives: [
    'fal-ai/flux-2-pro',
    'fal-ai/flux-pro/kontext',
  ],
} as const

const EDIT_MAP: Record<string, string> = {
  'fal-ai/nano-banana-2': 'fal-ai/nano-banana-2/edit',
  'fal-ai/nano-banana-pro': 'fal-ai/nano-banana-pro/edit',
  'fal-ai/flux-pro/kontext': 'fal-ai/flux-pro/kontext',
  'fal-ai/bytedance/seedream/v4.5/edit': 'fal-ai/bytedance/seedream/v4.5/edit',
}

export function getDefaultModel(tier: Tier): string {
  return tier === 'premium' ? PREMIUM_MODELS.default : ECONOMY_MODELS.default
}

export function getActiveModels(tier: Tier): readonly string[] {
  const set = tier === 'premium' ? PREMIUM_MODELS : ECONOMY_MODELS
  return [set.default, ...set.alternatives]
}

export function getEditModel(textModel: string): string | null {
  return EDIT_MAP[textModel] ?? null
}

export function isModelInTier(model: string, tier: Tier): boolean {
  return getActiveModels(tier).includes(model)
}
