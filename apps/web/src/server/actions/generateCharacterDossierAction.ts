'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { friendlyMediaError } from '@/server/lib/media-error-message';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { reserveMediaJob } from '@/server/lib/rate-limit';
import {
  finalizeMediaJobReservation,
  rollbackMediaJobReservation,
} from '@/server/lib/scene-helpers';
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

    // Two parallel jobs: 16:9 model-sheet (main dossier) + 1:1 portrait (avatar).
    // Reserve both slots BEFORE provider.submit so a quota-exhausted user can't
    // burn fal credits on a partial pair. Both reservations are atomic under
    // the same per-user advisory lock — count + insert serialize.
    const [dossierRes, avatarRes] = await Promise.all([
      reserveMediaJob({
        user_id: user.id,
        project_id: input.project_id,
        kind: 'character_dossier',
        character_id: character.id,
      }),
      reserveMediaJob({
        user_id: user.id,
        project_id: input.project_id,
        kind: 'character_avatar',
        character_id: character.id,
      }),
    ]);
    if (!dossierRes.ok) {
      if (avatarRes.ok && !avatarRes.dedup) await rollbackMediaJobReservation(avatarRes.job_id);
      return { ok: false, error: dossierRes.error };
    }
    if (!avatarRes.ok) {
      if (!dossierRes.dedup) await rollbackMediaJobReservation(dossierRes.job_id);
      return { ok: false, error: avatarRes.error };
    }
    // If BOTH dedup'd, an active dossier+avatar pair already runs — return the
    // main job_id as "existing". If one dedup'd and the other didn't, we still
    // need to submit the non-dedup'd one, so we proceed (this is a recovery
    // path, e.g. avatar job was cancelled while dossier still running).
    if (dossierRes.dedup && avatarRes.dedup) {
      return { ok: true, job_id: dossierRes.job_id };
    }

    let mainHandle: Awaited<ReturnType<typeof provider.submitCharacterDossier>>;
    let avatarHandle: Awaited<ReturnType<typeof provider.submitCharacterDossier>>;
    try {
      [mainHandle, avatarHandle] = await Promise.all([
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
    } catch (e) {
      if (!dossierRes.dedup) await rollbackMediaJobReservation(dossierRes.job_id);
      if (!avatarRes.dedup) await rollbackMediaJobReservation(avatarRes.job_id);
      throw e;
    }

    await Promise.all([
      dossierRes.dedup
        ? Promise.resolve()
        : finalizeMediaJobReservation({
            job_id: dossierRes.job_id,
            model: mainHandle.model_used,
            fal_request_id: mainHandle.fal_request_id,
            request_input: mainHandle.request_input,
          }),
      avatarRes.dedup
        ? Promise.resolve()
        : finalizeMediaJobReservation({
            job_id: avatarRes.job_id,
            model: avatarHandle.model_used,
            fal_request_id: avatarHandle.fal_request_id,
            request_input: avatarHandle.request_input,
          }),
    ]);
    const mainJob = { job_id: dossierRes.job_id };
    const avatarJob = { job_id: avatarRes.job_id };

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
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error('[generateCharacterDossierAction]', detail, e);
    return { ok: false, error: detail.slice(0, 240) };
  }
}
