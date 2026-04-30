'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isModelInTier, type Character, type Tier } from '@mango/core'
import { getServerSupabase } from '@mango/db/server'
import { getCurrentUser } from '@/lib/auth/get-user'

const InputSchema = z.object({
  project_id: z.string().uuid(),
  character_id: z.string().uuid(),
  model: z.string().min(1),
})

export async function setCharacterModelAction(rawInput: unknown): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const input = InputSchema.parse(rawInput)
  const user = await getCurrentUser()
  const sb = await getServerSupabase()

  const { data: project, error: readErr } = await sb
    .from('projects')
    .select('script, tier')
    .eq('id', input.project_id)
    .eq('user_id', user.id)
    .single()
  if (readErr || !project) return { ok: false, error: 'project not found' }

  const tier = project.tier as Tier
  if (!isModelInTier(input.model, tier)) {
    return { ok: false, error: `модель ${input.model} недоступна в tier ${tier}` }
  }

  const script = (project.script ?? { characters: [] }) as { characters?: Character[] }
  const idx = script.characters?.findIndex(c => c.id === input.character_id) ?? -1
  if (idx < 0) return { ok: false, error: 'character not found' }

  const chars = script.characters!
  const current = chars[idx]
  if (!current) return { ok: false, error: 'character not found' }
  const updated: Character = {
    ...current,
    config_overrides: { ...current.config_overrides, model: input.model },
  }
  const characters = [...chars]
  characters[idx] = updated

  const { error: updateErr } = await sb
    .from('projects')
    .update({ script: { ...script, characters } as never })
    .eq('id', input.project_id)
    .eq('user_id', user.id)
  if (updateErr) return { ok: false, error: 'update failed' }

  revalidatePath(`/projects/${input.project_id}`)
  return { ok: true }
}
