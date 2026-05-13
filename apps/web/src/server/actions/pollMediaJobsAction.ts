'use server';

import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import {
  type MediaJobKind,
  applyAssetToScript,
  cascadeFirstFrameStale,
  recordPendingJob,
} from '@/server/lib/scene-helpers';
import { SCENE_ASSETS_BUCKET } from '@/server/lib/storage-paths';
import { getStorageProvider } from '@/server/lib/storage-provider-factory';
import {
  type Character,
  type Dossier,
  type InflightJob,
  type MasterClipVersion,
  type MirrorHint,
  type ReferenceImage,
  type SceneAssetVersion,
  type ScriptGenOutput,
  type StoredAsset,
  appendVersion,
  planNextChainStep,
  runPollTick,
} from '@mango/core';
import { getVideoModelMeta } from '@mango/core/media';
import { getServerSupabase } from '@mango/db/server';
import { submitFinalClipJob, submitVoiceJob } from '@/server/lib/audio-chain-helpers';
import { generateReferenceImageAction } from './generateReferenceImageAction';
import { mirrorSceneAssetToStorage } from './mirrorSceneAssetToStorage';

/**
 * Coerces a StoredAsset returned from the legacy storage provider
 * (kind: 'supabase', path) into the bucketed shape required by the
 * new scene-types schema (kind: 'supabase', bucket, path).
 */
function withBucket(stored: StoredAsset):
  | {
      kind: 'fal_passthrough';
      url: string;
    }
  | {
      kind: 'supabase';
      bucket: string;
      path: string;
    } {
  if (stored.kind === 'fal_passthrough') return stored;
  return { kind: 'supabase', bucket: SCENE_ASSETS_BUCKET, path: stored.path };
}

function extOf(stored: StoredAsset, fallback: string): string {
  const url = stored.kind === 'fal_passthrough' ? stored.url : `path://${stored.path}`;
  const m = url.match(/\.([a-zA-Z0-9]{1,5})(?:\?|$)/);
  return m?.[1]?.toLowerCase() ?? fallback;
}

export async function pollMediaJobsAction(input: { project_id: string }): Promise<
  { ok: true } | { ok: false; error: string }
> {
  let user: { id: string };
  try {
    user = await getCurrentUser();
  } catch {
    return { ok: false, error: 'unauthorized' };
  }

  const sb = await getServerSupabase();

  const { data: project, error: projErr } = await sb
    .from('projects')
    .select('user_id, script, tier')
    .eq('id', input.project_id)
    .single();
  if (projErr || !project) return { ok: false, error: 'project not found' };
  if (project.user_id !== user.id) return { ok: false, error: 'forbidden' };
  const projectTier = (project.tier ?? 'economy') as 'economy' | 'premium';

  const provider = getMediaProvider();
  const storage = getStorageProvider();

  await runPollTick(
    { project_id: input.project_id, user_id: user.id },
    {
      listInflight: async (project_id) => {
        const nowIso = new Date().toISOString();
        const { data, error } = await sb
          .from('media_jobs')
          .select('*')
          .eq('project_id', project_id)
          .in('status', ['pending', 'running'])
          // Phase 1.4.1: skip rows whose delayed_until is still in the future.
          // Supabase JS .or() with comma-separated PostgREST filters.
          .or(`delayed_until.is.null,delayed_until.lte.${nowIso}`);
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as InflightJob[];
      },

      finalizeCompleted: async ({
        job,
        result_storage,
        cost_usd,
        latency_ms,
      }): Promise<MirrorHint | undefined> => {
        const { data: proj } = await sb
          .from('projects')
          .select('script')
          .eq('id', job.project_id)
          .single();
        if (!proj?.script) return undefined;
        let nextScript = proj.script as unknown as ScriptGenOutput;
        const stored = result_storage as StoredAsset;
        const bucketedStored = withBucket(stored);
        const generated_at = new Date().toISOString();
        const requestInput = (job.request_input ?? {}) as Record<string, unknown>;

        let mirrorHint: MirrorHint | undefined;
        // F53 (T3): set when character_dossier write completes and no reference_image yet.
        let chainReferenceImageFor: { project_id: string; character_id: string } | null = null;

        if (job.kind === 'first_frame' && job.scene_id) {
          // Phase 1.3.5: append to first_frame_versions, set active.
          const sceneIdx = nextScript.scenes.findIndex((s) => s.scene_id === job.scene_id);
          if (sceneIdx >= 0) {
            const scene = nextScript.scenes[sceneIdx]! as unknown as {
              first_frame_versions: SceneAssetVersion[];
              first_frame_active_version_id: string | null;
              first_frame_source?: 'auto_continuity' | 'manual_text2img' | 'user_upload';
            };
            const promptStr = typeof requestInput.prompt === 'string' ? requestInput.prompt : null;
            const newVersion: SceneAssetVersion = {
              version_id: randomUUID(),
              storage: bucketedStored,
              prompt: promptStr,
              model: job.model,
              generated_at,
              cost_usd: cost_usd ?? null,
              source:
                scene.first_frame_source === 'manual_text2img'
                  ? 'manual_text2img'
                  : scene.first_frame_source === 'user_upload'
                    ? 'user_upload'
                    : 'auto_continuity',
            };
            const { versions, active_version_id, dropped } = appendVersion(
              {
                versions: scene.first_frame_versions ?? [],
                active_version_id: scene.first_frame_active_version_id ?? null,
              },
              newVersion,
            );
            const updatedScene = {
              ...nextScript.scenes[sceneIdx]!,
              first_frame_versions: versions,
              first_frame_active_version_id: active_version_id,
            };
            const scenes = [...nextScript.scenes];
            scenes[sceneIdx] = updatedScene as unknown as (typeof scenes)[number];
            nextScript = { ...nextScript, scenes };

            const droppedPath =
              dropped && dropped.storage.kind === 'supabase' ? dropped.storage.path : undefined;
            mirrorHint = {
              project_id: job.project_id,
              scene_id: job.scene_id,
              version_id: newVersion.version_id,
              kind: 'first_frame',
              ext: extOf(stored, 'png'),
              dropped_supabase_path: droppedPath,
            };
          }
        } else if (job.kind === 'video' && job.scene_id) {
          const sceneIdx = nextScript.scenes.findIndex((s) => s.scene_id === job.scene_id);
          if (sceneIdx >= 0) {
            const scene = nextScript.scenes[sceneIdx]! as unknown as {
              video_versions: SceneAssetVersion[];
              video_active_version_id: string | null;
            };
            const meta = getVideoModelMeta(job.model);
            const promptStr = typeof requestInput.prompt === 'string' ? requestInput.prompt : null;
            const newVersion: SceneAssetVersion = {
              version_id: randomUUID(),
              storage: bucketedStored,
              prompt: promptStr,
              model: job.model,
              generated_at,
              cost_usd: cost_usd ?? null,
              has_native_audio: meta?.has_native_audio ?? false,
              source: 'auto_continuity',
            };
            const { versions, active_version_id, dropped } = appendVersion(
              {
                versions: scene.video_versions ?? [],
                active_version_id: scene.video_active_version_id ?? null,
              },
              newVersion,
            );
            const updatedScene = {
              ...nextScript.scenes[sceneIdx]!,
              video_versions: versions,
              video_active_version_id: active_version_id,
            };
            const scenes = [...nextScript.scenes];
            scenes[sceneIdx] = updatedScene as unknown as (typeof scenes)[number];
            nextScript = { ...nextScript, scenes };
            // Subsequent scene's first_frame becomes stale relative to new continuity.
            nextScript = cascadeFirstFrameStale(nextScript, job.scene_id);

            const droppedPath =
              dropped && dropped.storage.kind === 'supabase' ? dropped.storage.path : undefined;
            mirrorHint = {
              project_id: job.project_id,
              scene_id: job.scene_id,
              version_id: newVersion.version_id,
              kind: 'video',
              ext: extOf(stored, 'mp4'),
              dropped_supabase_path: droppedPath,
            };
          }
        } else if (job.kind === 'voice' && job.scene_id) {
          const sceneIdx = nextScript.scenes.findIndex((s) => s.scene_id === job.scene_id);
          if (sceneIdx >= 0) {
            const scene = nextScript.scenes[sceneIdx]! as unknown as {
              voice_audio_versions: SceneAssetVersion[];
              voice_audio_active_version_id: string | null;
            };
            const newVersion: SceneAssetVersion = {
              version_id: randomUUID(),
              storage: bucketedStored,
              prompt: typeof requestInput.text === 'string' ? (requestInput.text as string) : null,
              model: job.model,
              generated_at,
              cost_usd: cost_usd ?? null,
              source: 'auto_continuity',
            };
            const { versions, active_version_id, dropped } = appendVersion(
              {
                versions: scene.voice_audio_versions ?? [],
                active_version_id: scene.voice_audio_active_version_id ?? null,
              },
              newVersion,
            );
            const updatedScene = {
              ...nextScript.scenes[sceneIdx]!,
              voice_audio_versions: versions,
              voice_audio_active_version_id: active_version_id,
            };
            const scenes = [...nextScript.scenes];
            scenes[sceneIdx] = updatedScene as unknown as (typeof scenes)[number];
            nextScript = { ...nextScript, scenes };

            const droppedPath =
              dropped && dropped.storage.kind === 'supabase' ? dropped.storage.path : undefined;
            mirrorHint = {
              project_id: job.project_id,
              scene_id: job.scene_id,
              version_id: newVersion.version_id,
              kind: 'voice_audio',
              ext: extOf(stored, 'mp3'),
              dropped_supabase_path: droppedPath,
            };
          }
        } else if (job.kind === 'final_clip' && job.scene_id) {
          // final_clip is a derived asset, not versioned. It links to the
          // active video + voice_audio versions used at compose time.
          const videoVersionId =
            typeof requestInput.video_version_id === 'string'
              ? (requestInput.video_version_id as string)
              : null;
          const voiceAudioVersionId =
            typeof requestInput.voice_audio_version_id === 'string'
              ? (requestInput.voice_audio_version_id as string)
              : null;
          if (videoVersionId) {
            const sceneIdx = nextScript.scenes.findIndex((s) => s.scene_id === job.scene_id);
            if (sceneIdx >= 0) {
              const updatedScene = {
                ...nextScript.scenes[sceneIdx]!,
                final_clip: {
                  storage: bucketedStored,
                  composed_from: {
                    video_version_id: videoVersionId,
                    voice_audio_version_id: voiceAudioVersionId,
                  },
                },
              };
              const scenes = [...nextScript.scenes];
              scenes[sceneIdx] = updatedScene as unknown as (typeof scenes)[number];
              nextScript = { ...nextScript, scenes };
            }
          }
          // No mirror hint — final_clip storage is not versioned.
        } else if (job.kind === 'master_clip') {
          const scriptShape = nextScript as unknown as {
            master_clip_versions?: MasterClipVersion[];
            master_clip_active_version_id?: string | null;
          };
          const composed = Array.isArray(requestInput.composed)
            ? (requestInput.composed as MasterClipVersion['composed_from_scene_versions'])
            : nextScript.scenes.map((s) => ({
                scene_id: s.scene_id,
                video_version_id: '',
                voice_audio_version_id: null,
              }));
          const hasFullAudio =
            typeof requestInput.has_full_audio === 'boolean'
              ? (requestInput.has_full_audio as boolean)
              : undefined;
          const newVersion: MasterClipVersion = {
            version_id: randomUUID(),
            storage: bucketedStored,
            generated_at,
            cost_usd: cost_usd ?? null,
            composed_from_scene_versions: composed,
            ...(hasFullAudio !== undefined ? { has_full_audio: hasFullAudio } : {}),
          };
          const { versions, active_version_id, dropped } = appendVersion(
            {
              versions: scriptShape.master_clip_versions ?? [],
              active_version_id: scriptShape.master_clip_active_version_id ?? null,
            },
            newVersion,
          );
          nextScript = {
            ...nextScript,
            ...({
              master_clip_versions: versions,
              master_clip_active_version_id: active_version_id,
            } as unknown as Record<string, unknown>),
          } as ScriptGenOutput;

          const droppedPath =
            dropped && dropped.storage.kind === 'supabase' ? dropped.storage.path : undefined;
          mirrorHint = {
            project_id: job.project_id,
            version_id: newVersion.version_id,
            kind: 'master_clip',
            ext: extOf(stored, 'mp4'),
            dropped_supabase_path: droppedPath,
          };
        } else if (job.kind === 'last_frame_extract' && job.scene_id) {
          // Continuity helper — not versioned, lives at scene.last_frame.
          const sceneIdx = nextScript.scenes.findIndex((s) => s.scene_id === job.scene_id);
          if (sceneIdx >= 0) {
            const scene = nextScript.scenes[sceneIdx]! as unknown as {
              first_frame_active_version_id: string | null;
            };
            const updatedScene = {
              ...nextScript.scenes[sceneIdx]!,
              last_frame: {
                storage: bucketedStored,
                extracted_from_version_id: scene.first_frame_active_version_id ?? '',
              },
            };
            const scenes = [...nextScript.scenes];
            scenes[sceneIdx] = updatedScene as unknown as (typeof scenes)[number];
            nextScript = { ...nextScript, scenes };
          }
        } else if (job.character_id) {
          // Character branches stay on legacy single-asset path (no versioning).
          const characters = ((nextScript as unknown as { characters?: Character[] }).characters ??
            []) as Character[];
          const idx = characters.findIndex((c) => c.id === job.character_id);
          if (idx >= 0) {
            const character = characters[idx]!;
            const updated: Character = { ...character };
            if (job.kind === 'character_dossier') {
              const quality = (
                typeof requestInput.quality === 'string' ? requestInput.quality : '1080p'
              ) as '720p' | '1080p' | '2k';
              const dossier: Dossier = {
                storage: stored,
                model: job.model,
                format: '16:9',
                quality,
                generated_at,
              };
              updated.dossier = character.dossier
                ? { ...dossier, avatar: character.dossier.avatar }
                : dossier;
              // Chain: after this write, trigger reference_image generation if not already set.
              // We check the PRE-write state: if dossier.reference_image wasn't set before,
              // it won't be in the newly written dossier either — dispatch the chain.
              if (!character.dossier?.reference_image) {
                chainReferenceImageFor = {
                  project_id: job.project_id,
                  character_id: job.character_id,
                };
              }
            } else if (job.kind === 'character_avatar') {
              const quality = (
                typeof requestInput.quality === 'string' ? requestInput.quality : '1080p'
              ) as '720p' | '1080p' | '2k';
              if (character.dossier) {
                updated.dossier = { ...character.dossier, avatar: stored };
              } else {
                // Avatar lands first (rare race) — seed minimal dossier with avatar only.
                updated.dossier = {
                  storage: stored,
                  avatar: stored,
                  model: job.model,
                  format: '16:9',
                  quality,
                  generated_at,
                };
              }
            } else if (job.kind === 'character_reference') {
              const newRef: ReferenceImage = {
                storage: stored,
                source: 'ai_generated',
                uploaded_at: generated_at,
              };
              updated.reference_images = [...(character.reference_images ?? []), newRef];
            } else if (job.kind === 'character_reference_image') {
              // Phase 1.4 F53: single-pose 1:1 reference image stored under dossier.reference_image.
              if (character.dossier) {
                updated.dossier = { ...character.dossier, reference_image: stored };
              } else {
                console.warn(
                  '[pollMediaJobs] character_reference_image completed but character.dossier missing — write dropped',
                  {
                    project_id: job.project_id,
                    character_id: job.character_id,
                    request_id: job.fal_request_id,
                  },
                );
              }
              // If character.dossier hasn't landed yet, drop the write. The dossier→reference_image chain
              // in T3 guarantees ordering when triggered automatically; this branch only fires on a manual
              // invocation race, which currently has no recovery path. If this becomes a real issue,
              // emit a retry job or queue the asset until dossier arrives.
            }
            const newCharacters = [...characters];
            newCharacters[idx] = updated;
            nextScript = {
              ...nextScript,
              characters: newCharacters as unknown as ScriptGenOutput['characters'],
            };
          }
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

        // ── Audio chain advancement (Phase 1.4.1) ───────────────────────
        // After a video or voice job lands, ask planNextChainStep what
        // (if anything) should happen next for this scene and enqueue it.
        // The helpers are idempotent via recordPendingJob's dedup, so
        // double-polling is safe.
        if (job.scene_id && (job.kind === 'video' || job.kind === 'voice')) {
          try {
            await advanceAudioChain(nextScript, job.scene_id, {
              user_id: job.user_id,
              project_id: job.project_id,
              project_tier: projectTier,
            });
          } catch (e) {
            console.warn('[pollMediaJobs] audio chain advance failed', {
              project_id: job.project_id,
              scene_id: job.scene_id,
              kind: job.kind,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // F53 (Task 1.4.D.T3): after dossier write completes, chain reference_image generation.
        // Fire-and-forget: dossier is already saved above; ref-image failure must not roll it back.
        if (chainReferenceImageFor) {
          const chainTarget = chainReferenceImageFor;
          void generateReferenceImageAction({
            project_id: chainTarget.project_id,
            character_id: chainTarget.character_id,
          })
            .then((r) => {
              if (!r.ok) {
                console.warn('[pollMediaJobs] post-dossier reference image dispatch failed', {
                  project_id: chainTarget.project_id,
                  character_id: chainTarget.character_id,
                  error: r.error,
                });
              }
            })
            .catch((e: unknown) => {
              console.warn('[pollMediaJobs] post-dossier reference image dispatch threw', {
                project_id: chainTarget.project_id,
                character_id: chainTarget.character_id,
                error: e instanceof Error ? e.message : String(e),
              });
            });
        }

        return mirrorHint;
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

        // Phase 1.4.1: auto-retry voice / final_clip once with a 15 s backoff.
        const isAudioKind = job.kind === 'voice' || job.kind === 'final_clip';
        const currentRetryCount = job.retry_count ?? 0;
        if (!isAudioKind || currentRetryCount >= 1 || !job.scene_id) return;

        try {
          const { data: proj } = await sb
            .from('projects')
            .select('script, tier')
            .eq('id', job.project_id)
            .single();
          if (!proj?.script) return;
          const script = proj.script as unknown as ScriptGenOutput;
          const scene = (script.scenes as unknown as ChainSceneInScript[]).find(
            (s) => s.scene_id === job.scene_id,
          );
          if (!scene) return;

          const tier = (proj.tier ?? 'economy') as 'economy' | 'premium';
          const effectiveTier = scene.config_overrides?.tier ?? tier;
          const characters = ((script as unknown as { characters?: Character[] }).characters ??
            []) as Character[];
          const narratorVoice = (script as unknown as {
            narrator_voice?: {
              tts_voice_id: string;
              description?: string;
              stability?: number;
              similarity_boost?: number;
              style?: number;
              speed?: number;
            };
          }).narrator_voice ?? null;
          const delayedUntil = new Date(Date.now() + 15_000).toISOString();

          if (job.kind === 'voice') {
            if (!scene.dialogue?.text) return;
            await submitVoiceJob({
              user_id: job.user_id,
              project_id: job.project_id,
              scene_id: scene.scene_id,
              dialogue: scene.dialogue,
              characters,
              narrator_voice: narratorVoice,
              effective_tier: effectiveTier,
              video_model_id: scene.config_overrides?.model,
              initial_retry_count: 1,
              delayed_until: delayedUntil,
            });
          } else {
            // final_clip retry: re-mux from current active video + voice
            const activeVideo = scene.video_versions?.find(
              (v) => v.version_id === scene.video_active_version_id,
            );
            if (!activeVideo) return;
            const activeVoice = scene.voice_audio_versions?.find(
              (v) => v.version_id === scene.voice_audio_active_version_id,
            );
            const meta = getVideoModelMeta(
              activeVideo.model ?? scene.config_overrides?.model ?? '',
            );
            await submitFinalClipJob({
              user_id: job.user_id,
              project_id: job.project_id,
              scene_id: scene.scene_id,
              video_version: {
                version_id: activeVideo.version_id,
                storage: activeVideo.storage,
                has_native_audio: meta?.has_native_audio ?? false,
              },
              voice_version: activeVoice
                ? { version_id: activeVoice.version_id, storage: activeVoice.storage }
                : null,
              initial_retry_count: 1,
              delayed_until: delayedUntil,
              current_script: script as unknown as {
                scenes: Array<Record<string, unknown> & { scene_id: string }>;
              },
            });
          }
        } catch (e) {
          console.warn('[pollMediaJobs] auto-retry failed', {
            job_id: job.id,
            kind: job.kind,
            error: e instanceof Error ? e.message : String(e),
          });
        }
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

      // Phase 1.3.5: async fal CDN → Supabase Storage mirror.
      mirror: mirrorSceneAssetToStorage,
      deleteStorage: async (path: string) => {
        await sb.storage.from(SCENE_ASSETS_BUCKET).remove([path]);
      },

      provider,
    },
  );

  return { ok: true };
}

// keep referenced imports stable for type narrowing
void applyAssetToScript;

type ChainSceneInScript = {
  scene_id: string;
  audio_mode?: 'native' | 'silent_tts' | 'auto';
  dialogue?: { speaker: string; text: string } | null;
  config_overrides?: { tier?: 'economy' | 'premium'; model?: string };
  video_versions?: SceneAssetVersion[];
  video_active_version_id?: string | null;
  voice_audio_versions?: SceneAssetVersion[];
  voice_audio_active_version_id?: string | null;
  final_clip?: {
    composed_from: { video_version_id: string; voice_audio_version_id: string | null };
  } | null;
};

async function advanceAudioChain(
  script: ScriptGenOutput,
  scene_id: string,
  ctx: { user_id: string; project_id: string; project_tier: 'economy' | 'premium' },
): Promise<void> {
  const scene = (script.scenes as unknown as ChainSceneInScript[]).find(
    (s) => s.scene_id === scene_id,
  );
  if (!scene) return;
  if (!scene.dialogue || !scene.dialogue.text || !scene.dialogue.text.trim()) return;

  const activeVideo = scene.video_versions?.find(
    (v) => v.version_id === scene.video_active_version_id,
  );
  const videoModelId =
    activeVideo?.model ?? scene.config_overrides?.model ?? undefined;
  const modelMeta = {
    has_native_audio: videoModelId
      ? (getVideoModelMeta(videoModelId)?.has_native_audio ?? false)
      : false,
  };

  const step = planNextChainStep(
    {
      scene_id: scene.scene_id,
      audio_mode: scene.audio_mode,
      video_versions: (scene.video_versions ?? []).map((v) => ({ version_id: v.version_id })),
      video_active_version_id: scene.video_active_version_id ?? null,
      voice_audio_versions: (scene.voice_audio_versions ?? []).map((v) => ({
        version_id: v.version_id,
      })),
      voice_audio_active_version_id: scene.voice_audio_active_version_id ?? null,
      final_clip: scene.final_clip ?? null,
      model_meta: modelMeta,
    },
    scene.dialogue ?? null,
  );

  if (!step) return;

  const effectiveTier = scene.config_overrides?.tier ?? ctx.project_tier;
  const characters = ((script as unknown as { characters?: Character[] }).characters ??
    []) as Character[];
  const narratorVoice = (script as unknown as {
    narrator_voice?: {
      tts_voice_id: string;
      description?: string;
      stability?: number;
      similarity_boost?: number;
      style?: number;
      speed?: number;
    };
  }).narrator_voice ?? null;

  if (step.kind === 'voice') {
    await submitVoiceJob({
      user_id: ctx.user_id,
      project_id: ctx.project_id,
      scene_id: scene.scene_id,
      dialogue: scene.dialogue!,
      characters,
      narrator_voice: narratorVoice,
      effective_tier: effectiveTier,
      video_model_id: videoModelId,
      initial_retry_count: 0,
    });
    return;
  }

  // step.kind === 'final_clip'
  if (!activeVideo) return;
  const activeVoice = step.voice_audio_version_id
    ? scene.voice_audio_versions?.find((v) => v.version_id === step.voice_audio_version_id)
    : null;
  await submitFinalClipJob({
    user_id: ctx.user_id,
    project_id: ctx.project_id,
    scene_id: scene.scene_id,
    video_version: {
      version_id: step.video_version_id,
      storage: activeVideo.storage,
      has_native_audio: modelMeta.has_native_audio,
    },
    voice_version: activeVoice
      ? { version_id: activeVoice.version_id, storage: activeVoice.storage }
      : null,
    initial_retry_count: 0,
    current_script: script as unknown as {
      scenes: Array<Record<string, unknown> & { scene_id: string }>;
    },
  });
}
