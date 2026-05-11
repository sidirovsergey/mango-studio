'use client';

import { cancelMediaJobAction } from '@/server/actions/cancelMediaJobAction';
import { rollbackVersionAction } from '@/server/actions/rollbackVersionAction';
import { setActiveVersionAction } from '@/server/actions/setActiveVersionAction';
import type { SceneAssetVersion } from '@mango/core';
import type { Database } from '@mango/db';
import { useState, useTransition } from 'react';
import type { SceneView } from './Stage04Provider';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];
type Mode = 'first_frame' | 'video';

interface Props {
  projectId: string;
  scene: SceneView;
  index: number;
  activeJob: MediaJobRow | null;
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

const JOB_KIND_LABEL_SHORT: Record<string, string> = {
  first_frame: 'Кадр',
  video: 'Видео',
  voice: 'Голос',
  final_clip: 'Сборка',
  last_frame_extract: 'Continuity',
  master_clip: 'Master',
};

export function SceneThumbnailColumn({ projectId, scene, activeJob }: Props) {
  const [mode, setMode] = useState<Mode>(() =>
    scene.video_versions.length > 0 ? 'video' : 'first_frame',
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const activeJobLabel = activeJob
    ? (JOB_KIND_LABEL_SHORT[activeJob.kind] ?? activeJob.kind)
    : null;

  const versions = mode === 'first_frame' ? scene.first_frame_versions : scene.video_versions;
  const activeId =
    mode === 'first_frame' ? scene.first_frame_active_version_id : scene.video_active_version_id;
  const active = getActiveVersion(versions, activeId);
  const lastVersion = versions.length > 0 ? versions[versions.length - 1] : null;
  const isLatest = !!active && !!lastVersion && lastVersion.version_id === active.version_id;
  const isActiveJob = !!activeJob && ['pending', 'running'].includes(activeJob.status);

  const handlePickVersion = (vid: string) => {
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

  return (
    <div className="thumb-col">
      <div className="thumb">
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
        ) : active ? (
          mode === 'video' ? (
            // biome-ignore lint/a11y/useMediaCaption: AI scene clip — no caption track yet
            <video
              src={getAssetUrl(active) ?? undefined}
              controls
              loop
              playsInline
              className="thumb-media"
            />
          ) : (
            // Next.js Image isn't suitable here — signed-url passthrough varies per render
            <img
              src={getAssetUrl(active) ?? undefined}
              alt={`Сцена ${scene.scene_id}`}
              className="thumb-media"
            />
          )
        ) : (
          <div className="thumb-empty">Не сгенерировано</div>
        )}
        {!isActiveJob && (
          <div className="thumb-badges">
            {active?.has_native_audio !== undefined && (
              <span className="badge" title={active.has_native_audio ? 'Native audio' : 'Silent'}>
                {active.has_native_audio ? '🎵' : '🔇'}
              </span>
            )}
            {stale && (
              <span className="badge warn" title="Кадр обновлён после видео — стоит regen">
                🔁
              </span>
            )}
          </div>
        )}
        {scene.first_frame_versions.length > 0 && scene.video_versions.length > 0 && (
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
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'video'}
              className={mode === 'video' ? 'active' : ''}
              onClick={() => setMode('video')}
            >
              🎬 Видео
            </button>
          </div>
        )}
      </div>

      <div className="versions-strip">
        <span className="versions-label">v:</span>
        {versions.map((v, i) => (
          <button
            key={v.version_id}
            type="button"
            className={`ver-dot ${v.version_id === activeId ? 'current' : ''}`}
            onClick={() => handlePickVersion(v.version_id)}
            disabled={pending}
            title={`v${i + 1} — ${v.generated_at}`}
            aria-label={`Версия ${i + 1}`}
          />
        ))}
        <span className="ver-count">{versions.length} / 5</span>
      </div>

      {!isLatest && active && (
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
