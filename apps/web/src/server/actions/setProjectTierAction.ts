'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getServerSupabase } from '@mango/db/server'
import { getCurrentUser } from '@/lib/auth/get-user'

const InputSchema = z.object({
  project_id: z.string().uuid(),
  tier: z.enum(['economy', 'premium']),
})

export async function setProjectTierAction(rawInput: unknown): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const input = InputSchema.parse(rawInput)
  const user = await getCurrentUser()
  const sb = await getServerSupabase()

  const { error } = await sb
    .from('projects')
    .update({ tier: input.tier, updated_at: new Date().toISOString() })
    .eq('id', input.project_id)
    .eq('user_id', user.id)
  if (error) return { ok: false, error: 'update failed' }

  revalidatePath(`/projects/${input.project_id}`)
  return { ok: true }
}
