'use client';

import { cancelMediaJobAction } from '@/server/actions/cancelMediaJobAction';
import { generateFirstFrameAction } from '@/server/actions/generateFirstFrameAction';
import { generateSceneVideoAction } from '@/server/actions/generateSceneVideoAction';
import { regenSceneTextAction } from '@/server/actions/regenSceneTextAction';
import { setSceneDurationAction } from '@/server/actions/setSceneDurationAction';
import { setSceneModelAction } from '@/server/actions/setSceneModelAction';
import { toggleSceneContinuityAction } from '@/server/actions/toggleSceneContinuityAction';
import { uploadSceneAssetAction } from '@/server/actions/uploadSceneAssetAction';
import type { Character, Scene as CoreScene } from '@mango/core';
import { getActiveVideoModels } from '@mango/core';
import type { Database } from '@mango/db';
import { useRef, useState, useTransition } from 'react';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

type SceneWithOverrides = CoreScene & { config_overrides?: { model?: string } };

interface SceneCardProps {
  projectId: string;
  scene: SceneWithOverrides;
  index: number;
  characters: Character[];
  activeJob: MediaJobRow | null;
  tier: 'economy' | 'premium';
}

// ---- ContinuityToggle ----
interface ContinuityToggleProps {
  projectId: string;
  sceneId: string;
  source: string;
}

function ContinuityToggle({ projectId, sceneId, source }: ContinuityToggleProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isAuto = source === 'auto_continuity';

  const handleToggle = () => {
    const nextSource = isAuto ? 'manual_text2img' : 'auto_continuity';
    startTransition(async () => {
      const r = await toggleSceneContinuityAction({
        project_id: projectId,
        scene_id: sceneId,
        source: nextSource,
      });
      if (!r.ok) setError(r.error);
    });
  };

  return (
    <button
      type="button"
      className={`continuity-toggle ${isAuto ? 'on' : 'off'}`}
      onClick={handleToggle}
      disabled={isPending}
      title={isAuto ? 'Автопродолжение включено' : 'Ручной старт кадра'}
    >
      🔗{isAuto ? ' вкл' : ' выкл'}
      {error && <span className="ctrl-error"> !</span>}
    </button>
  );
}

// ---- ModelSelector ----
interface ModelSelectorProps {
  projectId: string;
  sceneId: string;
  currentModel: string | undefined;
  tier: 'economy' | 'premium';
}

/**
 * Human-readable model labels. Slug → "Vendor — Model · audio/silent".
 * Without this users see a bare "image-to-video" string and have no idea
 * which provider/quality tier they're picking.
 */
const MODEL_LABELS: Record<string, { name: string; tag: string }> = {
  'fal-ai/bytedance/seedance/v1/lite/image-to-video': {
    name: 'ByteDance Seedance 1.0 Lite',
    tag: '🔇 silent · быстро',
  },
  'fal-ai/kling-video/v2.5-turbo/standard/image-to-video': {
    name: 'Kuaishou Kling 2.5 Turbo Standard',
    tag: '🔇 silent · средне',
  },
  'fal-ai/ltx-video': {
    name: 'Lightricks LTX Video',
    tag: '🔇 silent · превью',
  },
  'bytedance/seedance-2.0/image-to-video': {
    name: 'ByteDance Seedance 2.0 Pro',
    tag: '🎵 native audio · топ',
  },
  'fal-ai/veo3.1/image-to-video': {
    name: 'Google Veo 3.1',
    tag: '🎵 native audio · 8с фикс',
  },
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': {
    name: 'Kuaishou Kling 2.5 Turbo Pro',
    tag: '🔇 silent · качество',
  },
};

function modelDisplayName(slug: string | undefined): string {
  if (!slug) return 'авто';
  return MODEL_LABELS[slug]?.name ?? (slug.split('/').at(-1) ?? slug);
}

function ModelSelector({ projectId, sceneId, currentModel, tier }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const models = getActiveVideoModels(tier);

  const handleSelect = (model: string) => {
    setOpen(false);
    startTransition(async () => {
      const r = await setSceneModelAction({
        project_id: projectId,
        scene_id: sceneId,
        model,
      });
      if (!r.ok) setError(r.error);
    });
  };

  return (
    <div className="model-selector">
      <button
        type="button"
        className="model-btn"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        title="Выбрать модель видео-генерации"
      >
        {modelDisplayName(currentModel)} ▾
      </button>
      {error && <span className="ctrl-error"> !</span>}
      {open && (
        <div className="model-popover">
          {models.map((m) => {
            const label = MODEL_LABELS[m];
            return (
              <button
                key={m}
                type="button"
                className={`model-option ${m === currentModel ? 'active' : ''}`}
                onClick={() => handleSelect(m)}
              >
                <strong>{label?.name ?? m}</strong>
                {label?.tag && (
                  <span style={{ display: 'block', fontSize: 11, opacity: 0.7 }}>
                    {label.tag}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- DurationSelector ----
interface DurationSelectorProps {
  projectId: string;
  sceneId: string;
  durationSec: number;
  model: string | null;
  tier: 'economy' | 'premium';
}

function DurationSelector({ projectId, sceneId, durationSec, tier: _tier }: DurationSelectorProps) {
  const [isPending, startTransition] = useTransition();
  const [localDuration, setLocalDuration] = useState(durationSec);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setLocalDuration(val);
    startTransition(async () => {
      const r = await setSceneDurationAction({
        project_id: projectId,
        scene_id: sceneId,
        duration_sec: val,
      });
      if (!r.ok) {
        setError(r.error);
      } else if (r.ok) {
        setLocalDuration(r.clamped_to);
        setError(null);
      }
    });
  };

  return (
    <div className="duration-selector">
      <label className="duration-label" htmlFor={`dur-${sceneId}`}>
        {localDuration}s
      </label>
      <input
        id={`dur-${sceneId}`}
        type="range"
        className="duration-slider"
        min={1}
        max={30}
        value={localDuration}
        onChange={handleChange}
        disabled={isPending}
      />
      {error && <span className="ctrl-error"> !</span>}
    </div>
  );
}

// ---- UploadButton ----
interface UploadButtonProps {
  kind: 'first_frame' | 'video';
  projectId: string;
  sceneId: string;
  label: string;
}

function UploadButton({ kind, projectId, sceneId, label }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    startTransition(async () => {
      const r = await uploadSceneAssetAction({
        project_id: projectId,
        scene_id: sceneId,
        kind,
        file,
      });
      if (!r.ok) setError(r.error);
      else setError(null);
    });
    // Reset input so the same file can be re-uploaded
    e.target.value = '';
  };

  return (
    <div className="upload-btn-wrap">
      <button
        type="button"
        className="upload-btn"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
      >
        {isPending ? '...' : label}
      </button>
      {error && (
        <span className="ctrl-error" title={error}>
          {' '}
          !
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={kind === 'video' ? 'video/*' : 'image/*'}
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </div>
  );
}

// ---- SceneCard (main) ----
export function SceneCard({
  projectId,
  scene,
  index,
  characters,
  activeJob,
  tier,
}: SceneCardProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sceneCharacters = characters.filter((c) => scene.character_ids.includes(c.id));

  const isActive = Boolean(activeJob && ['pending', 'running'].includes(activeJob.status));
  const hasNativeAudio = scene.video?.has_native_audio ?? false;
  const isStale =
    scene.video && scene.first_frame
      ? scene.first_frame.generated_at > scene.video.generated_at
      : false;

  // Handlers
  const onGenerateFirstFrame = () => {
    startTransition(async () => {
      const r = await generateFirstFrameAction({
        project_id: projectId,
        scene_id: scene.scene_id,
      });
      if (!r.ok) setError(r.error);
      else setError(null);
    });
  };

  const onGenerateVideo = () => {
    startTransition(async () => {
      const r = await generateSceneVideoAction({
        project_id: projectId,
        scene_id: scene.scene_id,
      });
      if (!r.ok) setError(r.error);
      else setError(null);
    });
  };

  const onRegenText = () => {
    startTransition(async () => {
      const r = await regenSceneTextAction({
        project_id: projectId,
        scene_id: scene.scene_id,
      });
      if (!r.ok) setError(r.error);
      else setError(null);
    });
  };

  const onCancel = () => {
    if (!activeJob) return;
    startTransition(async () => {
      const r = await cancelMediaJobAction({ job_id: activeJob.id });
      if (!r.ok) setError(r.error);
      else setError(null);
    });
  };

  return (
    <div className="scene-card">
      {/* Header */}
      <div className="scene-card-header">
        <span className="scene-num">#{index + 1}</span>
        <span className="scene-duration">{scene.duration_sec}s</span>
        <div className="scene-avatars">
          {sceneCharacters.map((c) => {
            const imgSrc =
              c.dossier?.avatar?.kind === 'fal_passthrough'
                ? c.dossier.avatar.url
                : c.dossier?.storage?.kind === 'fal_passthrough'
                  ? c.dossier.storage.url
                  : null;
            return (
              <div key={c.id} className="avatar-chip" title={c.name}>
                {imgSrc ? (
                  <img src={imgSrc} alt={c.name} className="avatar-img" />
                ) : (
                  <span className="avatar-initial">{c.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
            );
          })}
        </div>
        {isStale && (
          <span className="stale-badge" title="Видео устарело — регенерируйте">
            🔁
          </span>
        )}
        {scene.video && (
          <span
            className="audio-badge"
            title={hasNativeAudio ? 'Есть нативное аудио' : 'Без аудио'}
          >
            {hasNativeAudio ? '🎵' : '🔇'}
          </span>
        )}
      </div>

      {/* Preview */}
      <div className="scene-preview">
        {isActive ? (
          <div className="preview-loading">
            <div className="spinner" />
            <button
              type="button"
              className="cancel-btn"
              onClick={onCancel}
              disabled={isPending}
              title="Отменить"
            >
              ✕
            </button>
          </div>
        ) : scene.video ? (
          // biome-ignore lint/a11y/useMediaCaption: AI-generated scene video, no caption track yet (post-launch backlog)
          <video
            className="preview-video"
            src={
              scene.video.storage.kind === 'fal_passthrough' ? scene.video.storage.url : undefined
            }
            controls
            loop
            playsInline
          />
        ) : scene.first_frame ? (
          <img
            className="preview-image"
            src={
              scene.first_frame.storage.kind === 'fal_passthrough'
                ? scene.first_frame.storage.url
                : undefined
            }
            alt={`Сцена ${index + 1}`}
          />
        ) : (
          <button
            type="button"
            className="generate-cta"
            onClick={onGenerateFirstFrame}
            disabled={isPending}
          >
            ▶ Генерировать
          </button>
        )}
      </div>

      {/* Dialogue */}
      <div className="scene-dialogue">
        {scene.dialogue ? (
          <p>
            <strong>{scene.dialogue.speaker}:</strong> {scene.dialogue.text}
          </p>
        ) : (
          <p className="no-dialogue">— нет реплики —</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="scene-error" title={error}>
          ⚠ {error}
        </div>
      )}

      {/* Regen row: text / first-frame / video */}
      <div className="scene-regen-row">
        <button
          type="button"
          onClick={onRegenText}
          disabled={isPending}
          title="Перегенерировать описание сцены и реплику"
        >
          ✏️ Текст
        </button>
        <button
          type="button"
          onClick={onGenerateFirstFrame}
          disabled={isPending}
          title="Перегенерировать первый кадр сцены"
        >
          🖼️ Кадр
        </button>
        <button
          type="button"
          onClick={onGenerateVideo}
          disabled={isPending || !scene.first_frame}
          title={!scene.first_frame ? 'Сначала нужен первый кадр' : 'Перегенерировать видео сцены'}
        >
          🎬 Видео
        </button>
      </div>

      {/* Advanced controls (Task 30) */}
      <div className="scene-controls-row">
        {scene.first_frame_source !== 'user_upload' && index > 0 && (
          <ContinuityToggle
            projectId={projectId}
            sceneId={scene.scene_id}
            source={scene.first_frame_source}
          />
        )}
        <ModelSelector
          projectId={projectId}
          sceneId={scene.scene_id}
          currentModel={scene.config_overrides?.model}
          tier={tier}
        />
        <DurationSelector
          projectId={projectId}
          sceneId={scene.scene_id}
          durationSec={scene.duration_sec}
          model={scene.config_overrides?.model ?? null}
          tier={tier}
        />
      </div>
      <div className="scene-uploads-row">
        <UploadButton
          kind="first_frame"
          projectId={projectId}
          sceneId={scene.scene_id}
          label="⬆ image"
        />
        <UploadButton kind="video" projectId={projectId} sceneId={scene.scene_id} label="⬆ video" />
      </div>
    </div>
  );
}
