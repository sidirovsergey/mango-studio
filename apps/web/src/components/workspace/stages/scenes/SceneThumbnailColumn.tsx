'use client';

import type { SceneView } from '@/components/workspace/ScriptStateProvider';
import { cancelMediaJobAction } from '@/server/actions/cancelMediaJobAction';
import { rollbackVersionAction } from '@/server/actions/rollbackVersionAction';
import { setActiveVersionAction } from '@/server/actions/setActiveVersionAction';
import type { SceneAssetVersion, StoredAsset } from '@mango/core';
import type { Database } from '@mango/db';
import { useState, useTransition } from 'react';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];
type Mode = 'first_frame' | 'video' | 'final';

interface Props {
  projectId: string;
  scene: SceneView;
  index: number;
  activeJob: MediaJobRow | null;
  failedAudioJob: MediaJobRow | null;
}

function getActiveVersion(
  versions: SceneAssetVersion[],
  activeId: string | null,
): SceneAssetVersion | null {
  if (!activeId) return null;
  return versions.find((v) => v.version_id === activeId) ?? null;
}

function getAssetUrl(v: SceneAssetVersion): string | null {
  return v.storage.kind === 'fal_passthrough'
    ? v.storage.url
    : `/api/scene-asset?path=${encodeURIComponent(v.storage.path)}`;
}

function getFinalClipUrl(storage: StoredAsset): string {
  return storage.kind === 'fal_passthrough'
    ? storage.url
    : `/api/scene-asset?path=${encodeURIComponent(storage.path)}`;
}

const JOB_KIND_LABEL_SHORT: Record<string, string> = {
  first_frame: 'Кадр',
  video: 'Видео',
  voice: 'Голос',
  final_clip: 'Сборка',
  last_frame_extract: 'Continuity',
  master_clip: 'Master',
};

export function SceneThumbnailColumn({ projectId, scene, activeJob, failedAudioJob }: Props) {
  const [mode, setMode] = useState<Mode>(() => {
    if (scene.final_clip) return 'final';
    if (scene.video_versions.length > 0) return 'video';
    return 'first_frame';
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const activeJobLabel = activeJob
    ? (JOB_KIND_LABEL_SHORT[activeJob.kind] ?? activeJob.kind)
    : null;

  const versionsForMode =
    mode === 'first_frame' ? scene.first_frame_versions : scene.video_versions;
  const activeIdForMode =
    mode === 'first_frame' ? scene.first_frame_active_version_id : scene.video_active_version_id;
  const active = mode === 'final' ? null : getActiveVersion(versionsForMode, activeIdForMode);
  const lastVersion =
    versionsForMode.length > 0 ? versionsForMode[versionsForMode.length - 1] : null;
  const isLatest = !!active && !!lastVersion && lastVersion.version_id === active.version_id;
  // Include 'reserved' — see comment in Stage04Inline jobsByScene derivation.
  const isActiveJob = !!activeJob && ['reserved', 'pending', 'running'].includes(activeJob.status);
  const _isAudioJob =
    !!activeJob && (activeJob.kind === 'voice' || activeJob.kind === 'final_clip');

  const handlePickVersion = (vid: string) => {
    if (mode === 'final') return;
    startTransition(async () => {
      const r = await setActiveVersionAction({
        project_id: projectId,
        scene_id: scene.scene_id,
        kind: mode,
        version_id: vid,
      });
      if (!r.ok) setError(r.error);
      else setError(null);
    });
  };

  const handleRollback = () => {
    if (mode === 'final') return;
    startTransition(async () => {
      const r = await rollbackVersionAction({
        project_id: projectId,
        scene_id: scene.scene_id,
        kind: mode,
      });
      if (!r.ok) setError(r.error);
      else setError(null);
    });
  };

  const handleCancel = () => {
    if (!activeJob) return;
    startTransition(async () => {
      await cancelMediaJobAction({ job_id: activeJob.id });
    });
  };

  // Stale indicator: the active first frame is newer than the active video,
  // implying the user should regen the video.
  const stale = (() => {
    if (!scene.first_frame_active_version_id || !scene.video_active_version_id) return false;
    const ff = scene.first_frame_versions.find(
      (v) => v.version_id === scene.first_frame_active_version_id,
    );
    const vd = scene.video_versions.find((v) => v.version_id === scene.video_active_version_id);
    return !!(ff && vd && ff.generated_at > vd.generated_at);
  })();

  // Mode-dependent media render
  const renderMedia = () => {
    if (mode === 'final' && scene.final_clip) {
      return (
        // biome-ignore lint/a11y/useMediaCaption: AI scene final mix
        <video
          src={getFinalClipUrl(scene.final_clip.storage)}
          controls
          loop
          playsInline
          className="thumb-media"
        />
      );
    }
    if (mode === 'video' && active) {
      return (
        // biome-ignore lint/a11y/useMediaCaption: AI scene clip — no caption track yet
        <video
          src={getAssetUrl(active) ?? undefined}
          controls
          loop
          playsInline
          className="thumb-media"
        />
      );
    }
    if (mode === 'first_frame' && active) {
      return (
        <img
          src={getAssetUrl(active) ?? undefined}
          alt={`Сцена ${scene.scene_id}`}
          className="thumb-media"
        />
      );
    }
    return <div className="thumb-empty">Не сгенерировано</div>;
  };

  // Mode toggle visibility
  const showModeToggle =
    (scene.final_clip || scene.video_versions.length > 0) && scene.first_frame_versions.length > 0;

  // Audio badge logic (Phase 1.4.1):
  //  - final_clip present → 🎵 со звуком
  //  - audio_mode='native' + has_native_audio → 🎵 native
  //  - audio_mode='native' + silent model → 🔇
  //  - otherwise → no audio badge (chain in progress)
  const audioBadge = (() => {
    if (isActiveJob || failedAudioJob) return null;
    if (scene.final_clip) return { icon: '🎵', title: 'Финальный микс готов' };
    if (scene.audio_mode === 'native' && active?.has_native_audio) {
      return { icon: '🎵', title: 'Native audio' };
    }
    if (scene.audio_mode === 'native' && active?.has_native_audio === false) {
      return { icon: '🔇', title: 'Silent (native mode + silent model)' };
    }
    return null;
  })();

  return (
    <div className="thumb-col">
      <div className="thumb">
        {/*
          AudioPipelineError + AudioPipelineSpinner deleted 2026-05-13 with
          the ElevenLabs TTS pipeline. Audio is baked into the video clip by
          the model — voice/final_clip jobs no longer exist for new scenes.
          Legacy in-flight audio jobs (rare during rollover) fall through to
          the regular thumb-loading branch.
        */}
        {isActiveJob ? (
          <div className="thumb-loading">
            <button
              type="button"
              className="thumb-cancel"
              onClick={handleCancel}
              disabled={pending}
              aria-label="Отменить генерацию"
              title="Отменить fal job"
            >
              ✕
            </button>
            <div className="thumb-loading-core">
              <div className="spinner" />
              <span className="thumb-loading-label">{activeJobLabel ?? 'генерация'}</span>
              <span className="thumb-loading-sub">обычно 30–90 сек</span>
            </div>
          </div>
        ) : (
          renderMedia()
        )}
        {!isActiveJob && !failedAudioJob && (
          <div className="thumb-badges">
            {audioBadge && (
              <span className="badge" title={audioBadge.title}>
                {audioBadge.icon}
              </span>
            )}
            {stale && (
              <span className="badge warn" title="Кадр обновлён после видео — стоит regen">
                🔁
              </span>
            )}
          </div>
        )}
        {showModeToggle && (
          <div className="thumb-mode" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'first_frame'}
              className={mode === 'first_frame' ? 'active' : ''}
              onClick={() => setMode('first_frame')}
            >
              🖼️ Кадр
            </button>
            {scene.video_versions.length > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'video'}
                className={mode === 'video' ? 'active' : ''}
                onClick={() => setMode('video')}
              >
                🎬 Видео
              </button>
            )}
            {scene.final_clip && (
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'final'}
                className={mode === 'final' ? 'active' : ''}
                onClick={() => setMode('final')}
              >
                🔊 Финал
              </button>
            )}
          </div>
        )}
      </div>

      {mode !== 'final' && (
        <div className="versions-strip">
          <span className="versions-label">v:</span>
          {versionsForMode.map((v, i) => (
            <button
              key={v.version_id}
              type="button"
              className={`ver-dot ${v.version_id === activeIdForMode ? 'current' : ''}`}
              onClick={() => handlePickVersion(v.version_id)}
              disabled={pending}
              title={`v${i + 1} — ${v.generated_at}`}
              aria-label={`Версия ${i + 1}`}
            />
          ))}
          <span className="ver-count">{versionsForMode.length} / 5</span>
        </div>
      )}

      {mode !== 'final' && !isLatest && active && (
        <button type="button" className="rollback-btn" onClick={handleRollback} disabled={pending}>
          ↺ откат на пред.
        </button>
      )}

      {error && (
        <span className="error" title={error}>
          ⚠
        </span>
      )}
    </div>
  );
}
