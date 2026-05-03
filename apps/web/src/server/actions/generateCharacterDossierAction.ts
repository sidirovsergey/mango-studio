'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { friendlyMediaError } from '@/server/lib/media-error-message';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import {
  type Character,
  MediaProviderError,
  type Tier,
  buildAvatarPrompt,
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

    const avatarPrompt = buildAvatarPrompt(
      {
        name: character.name,
        description: character.description,
        appearance: character.appearance,
        personality: character.personality,
      },
      style,
    );

    // Two parallel jobs: 16:9 model-sheet (main dossier) + 1:1 portrait (avatar
    // for character card thumbnail). Distinct kinds → both fit under the unique
    // partial index media_jobs_character_active.
    const [mainHandle, avatarHandle] = await Promise.all([
      provider.submitCharacterDossier(
        {
          prompt,
          model,
          format: '16:9',
          quality,
          image_refs: character.reference_images.map((r) => r.storage),
        },
        ctx,
      ),
      provider.submitCharacterDossier(
        {
          prompt: avatarPrompt,
          model,
          format: '1:1',
          quality,
          image_refs: [],
        },
        ctx,
      ),
    ]);

    const [mainJob, avatarJob] = await Promise.all([
      recordPendingJob({
        user_id: user.id,
        project_id: input.project_id,
        character_id: character.id,
        kind: 'character_dossier',
        model: mainHandle.model_used,
        fal_request_id: mainHandle.fal_request_id,
        request_input: mainHandle.request_input,
      }),
      recordPendingJob({
        user_id: user.id,
        project_id: input.project_id,
        character_id: character.id,
        kind: 'character_avatar',
        model: avatarHandle.model_used,
        fal_request_id: avatarHandle.fal_request_id,
        request_input: avatarHandle.request_input,
      }),
    ]);

    // Save full_prompt to character now; dossier+avatar storage land in poll-orchestrator.
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
    // Return the main job_id; avatar runs in parallel, polling will pick it up.
    void avatarJob;
    return { ok: true, job_id: mainJob.job_id };
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
