'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import type { StoredAsset } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
});

type Input = z.infer<typeof InputSchema>;

type FinalClip = {
  storage: StoredAsset;
  composed_from: {
    video_version_id: string;
    voice_audio_version_id: string | null;
  };
};

type SceneAssetVersion = {
  version_id: string;
  storage: StoredAsset;
};

type SceneShape = {
  scene_id: string;
  final_clip?: FinalClip | null;
  video_versions?: SceneAssetVersion[];
  video_active_version_id?: string | null;
};

type ScriptShape = { scenes: SceneShape[] };

function urlOfStorage(storage: StoredAsset): string {
  if (storage.kind === 'fal_passthrough') return storage.url;
  return `supabase://${storage.path}`;
}

export async function generateMasterClipAction(
  rawInput: unknown,
): Promise<{ ok: true; job_id: string; existing: boolean } | { ok: false; error: string }> {
  let input: Input;
  try {
    input = InputSchema.parse(rawInput);
  } catch {
    return { ok: false, error: 'invalid input' };
  }

  let user: { id: string };
  try {
    user = await getCurrentUser();
  } catch {
    return { ok: false, error: 'unauthorized' };
  }

  const sb = await getServerSupabase();
  const { data: project, error } = await sb
    .from('projects')
    .select('id, user_id, tier, script')
    .eq('id', input.project_id)
    .single();
  if (error || !project) return { ok: false, error: 'project not found' };
  if (project.user_id !== user.id) return { ok: false, error: 'forbidden' };

  const script = project.script as unknown as ScriptShape;
  if (!script) return { ok: false, error: 'project has no script' };

  // A scene contributes to master either via its muxed final_clip (preferred —
  // includes voice audio) OR via the raw active video version (fallback for
  // legacy scenes generated before the mux pipeline existed, or for silent
  // scenes where no voice TTS was rendered).
  type ResolvedClip = {
    scene_id: string;
    url: string;
    video_version_id: string;
    voice_audio_version_id: string | null;
  };
  const resolved: ResolvedClip[] = [];
  for (const s of script.scenes) {
    if (s.final_clip) {
      resolved.push({
        scene_id: s.scene_id,
        url: urlOfStorage(s.final_clip.storage),
        video_version_id: s.final_clip.composed_from.video_version_id,
        voice_audio_version_id: s.final_clip.composed_from.voice_audio_version_id,
      });
      continue;
    }
    const activeVid =
      s.video_active_version_id && s.video_versions
        ? s.video_versions.find((v) => v.version_id === s.video_active_version_id)
        : null;
    if (activeVid) {
      resolved.push({
        scene_id: s.scene_id,
        url: urlOfStorage(activeVid.storage),
        video_version_id: activeVid.version_id,
        voice_audio_version_id: null,
      });
      continue;
    }
    return {
      ok: false,
      error: `scene ${s.scene_id} has no final_clip and no active video version`,
    };
  }

  const composed = resolved.map((r) => ({
    scene_id: r.scene_id,
    video_version_id: r.video_version_id,
    voice_audio_version_id: r.voice_audio_version_id,
  }));
  const clip_urls = resolved.map((r) => r.url);

  const provider = getMediaProvider();
  const ctx = { user_id: user.id, project_id: input.project_id, character_id: '' };

  const handle = await provider.submitMasterConcat({ clip_urls }, ctx);

  const { job_id, existing } = await recordPendingJob({
    user_id: user.id,
    project_id: input.project_id,
    kind: 'master_clip',
    model: handle.model_used,
    fal_request_id: handle.fal_request_id,
    request_input: {
      ...(handle.request_input ?? {}),
      composed,
    },
  });

  return { ok: true, job_id, existing };
}
