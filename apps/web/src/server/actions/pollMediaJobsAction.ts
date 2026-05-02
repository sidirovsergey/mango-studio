'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import {
  applyAssetToScript,
  applyMasterClipToScript,
  cascadeFirstFrameStale,
  type MediaJobKind,
  recordPendingJob,
} from '@/server/lib/scene-helpers';
import { getStorageProvider } from '@/server/lib/storage-provider-factory';
import { getVideoModelMeta } from '@mango/core/media';
import {
  type InflightJob,
  type ScriptGenOutput,
  type StoredAsset,
  runPollTick,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';

export async function pollMediaJobsAction(
  input: { project_id: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user: { id: string };
  try {
    user = await getCurrentUser();
  } catch {
    return { ok: false, error: 'unauthorized' };
  }

  const sb = await getServerSupabase();

  const { data: project, error: projErr } = await sb
    .from('projects')
    .select('user_id, script')
    .eq('id', input.project_id)
    .single();
  if (projErr || !project) return { ok: false, error: 'project not found' };
  if (project.user_id !== user.id) return { ok: false, error: 'forbidden' };

  const provider = getMediaProvider();
  const storage = getStorageProvider();

  await runPollTick(
    { project_id: input.project_id, user_id: user.id },
    {
      listInflight: async (project_id) => {
        const { data, error } = await sb
          .from('media_jobs')
          .select('*')
          .eq('project_id', project_id)
          .in('status', ['pending', 'running']);
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as InflightJob[];
      },

      finalizeCompleted: async ({ job, result_storage, cost_usd, latency_ms }) => {
        const { data: proj } = await sb
          .from('projects')
          .select('script')
          .eq('id', job.project_id)
          .single();
        if (!proj?.script) return;
        let nextScript = proj.script as unknown as ScriptGenOutput;
        const stored = result_storage as StoredAsset;
        const generated_at = new Date().toISOString();
        const requestInput = (job.request_input ?? {}) as Record<string, unknown>;

        if (job.kind === 'master_clip') {
          nextScript = applyMasterClipToScript(nextScript, {
            storage: stored,
            generated_at,
            scene_ids_snapshot: nextScript.scenes.map((s) => s.scene_id),
            fal_request_id: job.fal_request_id,
          });
        } else if (job.scene_id) {
          if (job.kind === 'first_frame') {
            const hadRefs =
              Array.isArray(requestInput.image_urls) &&
              (requestInput.image_urls as unknown[]).length > 0;
            nextScript = applyAssetToScript(nextScript, {
              scene_id: job.scene_id,
              kind: 'first_frame',
              asset: {
                storage: stored,
                model: job.model,
                generated_at,
                fal_request_id: job.fal_request_id,
                source: hadRefs ? 'ai_img2img_continuity' : 'ai_text2img',
              },
            });
          } else if (job.kind === 'last_frame_extract') {
            nextScript = applyAssetToScript(nextScript, {
              scene_id: job.scene_id,
              kind: 'last_frame',
              asset: {
                storage: stored,
                model: job.model,
                generated_at,
                fal_request_id: job.fal_request_id,
              },
            });
          } else if (job.kind === 'video') {
            const meta = getVideoModelMeta(job.model);
            const duration_sec =
              typeof requestInput.duration === 'number' ? requestInput.duration : 8;
            nextScript = applyAssetToScript(nextScript, {
              scene_id: job.scene_id,
              kind: 'video',
              asset: {
                storage: stored,
                model: job.model,
                generated_at,
                fal_request_id: job.fal_request_id,
                duration_sec,
                source: 'ai_img2vid',
                has_native_audio: meta?.has_native_audio ?? false,
              },
            });
            nextScript = cascadeFirstFrameStale(nextScript, job.scene_id);
          } else if (job.kind === 'voice') {
            const voice_id =
              typeof requestInput.voice === 'string' ? requestInput.voice : 'unknown';
            nextScript = applyAssetToScript(nextScript, {
              scene_id: job.scene_id,
              kind: 'voice_audio',
              asset: {
                storage: stored,
                tts_provider: 'elevenlabs',
                voice_id,
                generated_at,
                fal_request_id: job.fal_request_id,
              },
            });
          } else if (job.kind === 'final_clip') {
            nextScript = applyAssetToScript(nextScript, {
              scene_id: job.scene_id,
              kind: 'final_clip',
              asset: {
                storage: stored,
                model: job.model,
                generated_at,
                fal_request_id: job.fal_request_id,
              },
            });
          }
        } else if (
          job.character_id &&
          (job.kind === 'character_dossier' || job.kind === 'character_reference')
        ) {
          // TODO(Phase 1.3.D): re-add character writeback after dedicated avatar
          // kind lands. For now, just mark the job completed without script update.
          // Document as "character writeback re-added after dedicated avatar kind lands".
        }

        await sb
          .from('projects')
          .update({ script: nextScript as never })
          .eq('id', job.project_id);

        await sb
          .from('media_jobs')
          .update({
            status: 'completed',
            cost_usd,
            latency_ms,
            result_storage: stored as never,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      },

      finalizeError: async ({ job, error_code }) => {
        await sb
          .from('media_jobs')
          .update({
            status: 'error',
            error_code,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      },

      recordPendingJob: async (params) =>
        recordPendingJob({ ...params, kind: params.kind as MediaJobKind }),

      persistAsset: async (url, ctx) =>
        storage.persist(url, {
          user_id: ctx.user_id,
          project_id: ctx.project_id,
          // character_id is a legacy field from 1.2 char-only persistence.
          // For scene jobs we pass '' as placeholder — used only for folder pathing.
          character_id: '',
        }),

      provider,
    },
  );

  return { ok: true };
}
