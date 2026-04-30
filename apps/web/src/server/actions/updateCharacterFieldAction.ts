'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Character } from '@mango/core'
import { getServerSupabase } from '@mango/db/server'
import { getCurrentUser } from '@/lib/auth/get-user'

const InputSchema = z.object({
  project_id: z.string().uuid(),
  character_id: z.string().uuid(),
  patch: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    full_prompt: z.string().optional(),
    voice: z.object({
      description: z.string().optional(),
      tts_provider: z.enum(['grok', 'elevenlabs']).optional(),
      tts_voice_id: z.string().optional(),
    }).optional(),
  }),
})

export async function updateCharacterFieldAction(rawInput: unknown): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const input = InputSchema.parse(rawInput)
  const user = await getCurrentUser()
  const sb = await getServerSupabase()

  const { data: project, error: readErr } = await sb
    .from('projects')
    .select('script')
    .eq('id', input.project_id)
    .eq('user_id', user.id)
    .single()
  if (readErr || !project) return { ok: false, error: 'project not found' }

  const script = (project.script ?? { characters: [] }) as { characters?: Character[] }
  const idx = script.characters?.findIndex(c => c.id === input.character_id) ?? -1
  if (idx < 0) return { ok: false, error: 'character not found' }

  const chars = script.characters!
  const current = chars[idx]
  if (!current) return { ok: false, error: 'character not found' }
  const updated: Character = {
    ...current,
    ...(input.patch.name !== undefined ? { name: input.patch.name } : {}),
    ...(input.patch.description !== undefined ? { description: input.patch.description } : {}),
    ...(input.patch.full_prompt !== undefined ? { full_prompt: input.patch.full_prompt } : {}),
    voice: input.patch.voice ? { ...current.voice, ...input.patch.voice } : current.voice,
  }
  const characters = [...chars]
  characters[idx] = updated

  const { error: updateErr } = await sb
    .from('projects')
    .update({ script: { ...script, characters } as never, updated_at: new Date().toISOString() })
    .eq('id', input.project_id)
    .eq('user_id', user.id)
  if (updateErr) return { ok: false, error: 'update failed' }

  revalidatePath(`/projects/${input.project_id}`)
  return { ok: true }
}
