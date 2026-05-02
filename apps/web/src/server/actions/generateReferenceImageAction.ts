'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { friendlyMediaError } from '@/server/lib/media-error-message';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import {
  type Character,
  MediaProviderError,
  type Tier,
  getDefaultModel,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  character_id: z.string().uuid(),
  guidance_prompt: z.string().optional(),
});

export async function generateReferenceImageAction(
  rawInput: unknown,
): Promise<{ ok: true; job_id: string } | { ok: false; error: string; error_code?: string }> {
  const input = InputSchema.parse(rawInput);
  const user = await getCurrentUser();
  const sb = await getServerSupabase();

  const { data: project, error: readErr } = await sb
    .from('projects')
    .select('script, tier')
    .eq('id', input.project_id)
    .eq('user_id', user.id)
    .single();
  if (readErr || !project) return { ok: false, error: 'project not found' };

  const tier = project.tier as Tier;
  const script = (project.script ?? { characters: [] }) as { characters?: Character[] };
  const idx = script.characters?.findIndex((c) => c.id === input.character_id) ?? -1;
  if (idx < 0) return { ok: false, error: 'character not found' };
  const chars = script.characters!;
  const character = chars[idx];
  if (!character) return { ok: false, error: 'character not found' };

  if (!character.dossier) {
    return { ok: false, error: 'сначала сгенерируй основное досье — нужен seed' };
  }

  const model = getDefaultModel(tier);
  const prompt =
    input.guidance_prompt ??
    `Альтернативный variation персонажа ${character.name}, иной угол / выражение / поза, тот же дизайн.`;
  const ctx = { user_id: user.id, project_id: input.project_id, character_id: character.id };

  try {
    const provider = getMediaProvider();
    const handle = await provider.submitCharacterDossier(
      {
        prompt,
        model,
        format: '16:9',
        quality: tier === 'premium' ? '1080p' : '720p',
        image_refs: [character.dossier.storage],
      },
      ctx,
    );

    const { job_id } = await recordPendingJob({
      user_id: user.id,
      project_id: input.project_id,
      character_id: character.id,
      kind: 'character_reference',
      model: handle.model_used,
      fal_request_id: handle.fal_request_id,
      request_input: handle.request_input,
    });

    // NOTE: reference_images writeback moves to poll-orchestrator (Task 13) — no DB update here.

    revalidatePath(`/projects/${input.project_id}`);
    return { ok: true, job_id };
  } catch (e) {
    if (e instanceof MediaProviderError) {
      return { ok: false, error: friendlyMediaError(e.code, e.message), error_code: e.code };
    }
    console.error('[generateReferenceImageAction]', e);
    return { ok: false, error: 'unexpected error' };
  }
}
