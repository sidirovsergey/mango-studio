// packages/core/src/media/storage/FalCdnPassthroughStorage.test.ts
import { describe, it, expect } from 'vitest'
import { FalCdnPassthroughStorage } from './FalCdnPassthroughStorage'

const ctx = { user_id: 'u', project_id: 'p', character_id: 'c' }

describe('FalCdnPassthroughStorage', () => {
  it('persist возвращает {kind:"fal_passthrough", url}', async () => {
    const s = new FalCdnPassthroughStorage()
    const a = await s.persist('https://v3.fal.media/x.png', ctx)
    expect(a).toEqual({ kind: 'fal_passthrough', url: 'https://v3.fal.media/x.png' })
  })
  it('getDisplayUrl для fal_passthrough = pass-through', async () => {
    const s = new FalCdnPassthroughStorage()
    const url = await s.getDisplayUrl({ kind: 'fal_passthrough', url: 'https://v3.fal.media/y.png' })
    expect(url).toBe('https://v3.fal.media/y.png')
  })
  it('getDisplayUrl для supabase бросает (этим storage не управляется)', async () => {
    const s = new FalCdnPassthroughStorage()
    await expect(s.getDisplayUrl({ kind: 'supabase', path: 'p' })).rejects.toThrow()
  })
})
