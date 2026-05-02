'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { friendlyMediaError } from '@/server/lib/media-error-message';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import {
  type Character,
  MediaProviderError,
  type Tier,
  buildDossierPrompt,
  getDefaultModel,
  isModelInTier,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  character_id: z.string().uuid(),
  custom_prompt: z.string().optional(),
  model_override: z.string().optional(),
});

export async function generateCharacterDossierAction(
  rawInput: unknown,
): Promise<{ ok: true; job_id: string } | { ok: false; error: string; error_code?: string }> {
  const input = InputSchema.parse(rawInput);
  const user = await getCurrentUser();
  const sb = await getServerSupabase();

  const { data: project, error: readErr } = await sb
    .from('projects')
    .select('script, tier, style')
    .eq('id', input.project_id)
    .eq('user_id', user.id)
    .single();
  if (readErr || !project) return { ok: false, error: 'project not found' };

  const tier = project.tier as Tier;
  const script = (project.script ?? { characters: [] }) as { characters?: Character[] };
  const characters = script.characters ?? [];
  const idx = characters.findIndex((c) => c.id === input.character_id);
  if (idx < 0) return { ok: false, error: 'character not found' };
  const character = characters[idx] as Character;

  const overrideModel = input.model_override ?? character.config_overrides?.model;
  const validOverride = overrideModel && isModelInTier(overrideModel, tier) ? overrideModel : null;
  const model = validOverride ?? getDefaultModel(tier);

  const style = (character.config_overrides?.style ?? project.style ?? '3d_pixar') as
    | '3d_pixar'
    | '2d_drawn'
    | 'clay_art';

  const prompt =
    input.custom_prompt ||
    character.full_prompt ||
    buildDossierPrompt(
      {
        name: character.name,
        description: character.description,
        appearance: character.appearance,
        personality: character.personality,
      },
      style,
    );

  const quality = (character.config_overrides?.quality ??
    (tier === 'premium' ? '1080p' : '720p')) as '720p' | '1080p' | '2k';
  const ctx = { user_id: user.id, project_id: input.project_id, character_id: character.id };

  try {
    const provider = getMediaProvider();
    const handle = await provider.submitCharacterDossier(
      {
        prompt,
        model,
        format: '16:9',
        quality,
        image_refs: character.reference_images.map((r) => r.storage),
      },
      ctx,
    );

    // NOTE(Phase 1.3): avatar gen dropped during async migration (Task 12). Will be
    // re-added in 1.3.D once poll-orchestrator + a dedicated avatar kind land.

    const { job_id } = await recordPendingJob({
      user_id: user.id,
      project_id: input.project_id,
      character_id: character.id,
      kind: 'character_dossier',
      model: handle.model_used,
      fal_request_id: handle.fal_request_id,
      request_input: handle.request_input,
    });

    // Save full_prompt to character now; dossier storage lands in poll-orchestrator (Task 13).
    const updated: Character = { ...character, full_prompt: prompt };
    const newCharacters = [...characters];
    newCharacters[idx] = updated;

    const { error: updateErr } = await sb
      .from('projects')
      .update({
        script: { ...script, characters: newCharacters } as never,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.project_id)
      .eq('user_id', user.id);
    if (updateErr) return { ok: false, error: 'update failed' };

    revalidatePath(`/projects/${input.project_id}`);
    return { ok: true, job_id };
  } catch (e) {
    if (e instanceof MediaProviderError) {
      return { ok: false, error: friendlyMediaError(e.code, e.message), error_code: e.code };
    }
    const detail =
      e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error('[generateCharacterDossierAction]', detail, e);
    return { ok: false, error: detail.slice(0, 240) };
  }
}
