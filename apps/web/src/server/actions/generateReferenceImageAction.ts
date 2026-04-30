'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { logMediaCall } from '@/server/lib/log-media-call';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { getReferenceStorage } from '@/server/lib/storage-provider-factory';
import {
  type Character,
  MediaProviderError,
  type ReferenceImage,
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
): Promise<{ ok: true } | { ok: false; error: string; error_code?: string }> {
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
    const result = await provider.generateCharacterDossier(
      {
        prompt,
        model,
        format: '16:9',
        quality: tier === 'premium' ? '1080p' : '720p',
        image_refs: [character.dossier.storage],
      },
      ctx,
    );

    await logMediaCall({
      user_id: user.id,
      project_id: input.project_id,
      model: result.model_used,
      method: 'generateReferenceImage',
      character_id: character.id,
      cost_usd: result.cost_usd,
      latency_ms: result.latency_ms,
      fal_request_id: result.fal_request_id,
      status: 'ok',
    });

    // AI-generated refs всегда persist в Supabase (не fal_passthrough)
    const storage = getReferenceStorage();
    const stored = await storage.persist(result.fal_url, ctx);

    const newRef: ReferenceImage = {
      storage: stored,
      source: 'ai_generated',
      uploaded_at: new Date().toISOString(),
    };
    const updated: Character = {
      ...character,
      reference_images: [...(character.reference_images ?? []), newRef],
    };
    const characters = [...chars];
    characters[idx] = updated;

    const { error: updateErr } = await sb
      .from('projects')
      .update({ script: { ...script, characters } as never })
      .eq('id', input.project_id)
      .eq('user_id', user.id);
    if (updateErr) return { ok: false, error: 'update failed' };

    revalidatePath(`/projects/${input.project_id}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof MediaProviderError) {
      await logMediaCall({
        user_id: user.id,
        project_id: input.project_id,
        model,
        method: 'generateReferenceImage',
        character_id: character.id,
        status: 'error',
        error_code: e.code,
      });
      return { ok: false, error: e.message, error_code: e.code };
    }
    console.error('[generateReferenceImageAction]', e);
    return { ok: false, error: 'unexpected error' };
  }
}
