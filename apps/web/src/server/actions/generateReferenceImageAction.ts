'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { friendlyMediaError } from '@/server/lib/media-error-message';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import {
  type Character,
  MediaProviderError,
  type StoredAsset,
  type Tier,
  buildReferenceImagePrompt,
  getDefaultModel,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  character_id: z.string().uuid(),
});

type Input = z.infer<typeof InputSchema>;

export async function generateReferenceImageAction(rawInput: unknown): Promise<
  | {
      ok: true;
      status: 'pending';
      job: { kind: 'character_reference_image'; request_id: string };
    }
  | {
      ok: true;
      status: 'already_exists';
      existing: { storage: StoredAsset; generated_at: string };
    }
  | { ok: false; error: string; error_code?: string }
> {
  let input: Input;
  try {
    input = InputSchema.parse(rawInput);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'invalid input' };
  }

  let user: { id: string };
  try {
    user = await getCurrentUser();
  } catch {
    return { ok: false, error: 'unauthorized' };
  }

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

  // Reference image is anchored to the dossier asset bundle. Requires dossier to exist.
  if (!character.dossier) {
    return {
      ok: false,
      error: 'requires_dossier',
      error_code: 'PRECONDITION_REQUIRES_DOSSIER',
    } as const;
  }

  // Idempotency check: if reference_image is already set, return existing asset.
  if (character.dossier.reference_image) {
    return {
      ok: true,
      status: 'already_exists',
      existing: {
        storage: character.dossier.reference_image as StoredAsset,
        generated_at: character.dossier.generated_at,
      },
    };
  }

  const model = getDefaultModel(tier);

  const style = (character.config_overrides?.style ?? project.style ?? '3d_pixar') as
    | '3d_pixar'
    | '2d_drawn'
    | 'clay_art';

  const charForPrompt = {
    name: character.name,
    description: character.description,
    full_prompt: character.full_prompt || undefined,
    appearance: character.appearance,
    personality: character.personality,
  };

  const prompt = buildReferenceImagePrompt(charForPrompt, style);
  const ctx = { user_id: user.id, project_id: input.project_id, character_id: character.id };

  // Image-to-image anchor: pass the multi-pose dossier sheet as the visual
  // reference so the resulting 1:1 reference_image stays consistent with
  // the dossier. Without this, the model re-rolls the character from text
  // independently and renders a different person every time — exactly the
  // "Норм аватарка и Норм досье — разные персонажи" symptom from the live
  // preview test.
  const image_refs: StoredAsset[] = character.dossier.storage
    ? [character.dossier.storage as StoredAsset]
    : [];

  try {
    const provider = getMediaProvider();

    const handle = await provider.submitCharacterReferenceImage(
      {
        prompt,
        model,
        aspect_ratio: '1:1',
        ...(image_refs.length > 0 ? { image_refs } : {}),
      },
      ctx,
    );

    await recordPendingJob({
      user_id: user.id,
      project_id: input.project_id,
      character_id: character.id,
      kind: 'character_reference_image',
      model: handle.model_used,
      fal_request_id: handle.fal_request_id,
      request_input: handle.request_input,
    });

    revalidatePath(`/projects/${input.project_id}`);
    return {
      ok: true,
      status: 'pending',
      job: { kind: 'character_reference_image', request_id: handle.fal_request_id },
    };
  } catch (e) {
    if (e instanceof MediaProviderError) {
      return { ok: false, error: friendlyMediaError(e.code, e.message), error_code: e.code };
    }
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error('[generateReferenceImageAction]', detail, e);
    return { ok: false, error: detail.slice(0, 240) };
  }
}
