'use client';

import { generateFirstFrameAction } from '@/server/actions/generateFirstFrameAction';
import { generateSceneVideoAction } from '@/server/actions/generateSceneVideoAction';
import { regenSceneTextAction } from '@/server/actions/regenSceneTextAction';
import { setSceneAudioModeAction } from '@/server/actions/setSceneAudioModeAction';
import { setSceneDurationAction } from '@/server/actions/setSceneDurationAction';
import { setSceneModelAction } from '@/server/actions/setSceneModelAction';
import { setSceneTierAction } from '@/server/actions/setSceneTierAction';
import { toggleSceneContinuityAction } from '@/server/actions/toggleSceneContinuityAction';
import { uploadSceneAssetAction } from '@/server/actions/uploadSceneAssetAction';
import { type Character, getActiveVideoModels, getVideoModelMeta } from '@mango/core';
import type { Database } from '@mango/db';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { PromptEditorModal } from './PromptEditorModal';
import type { SceneView } from './Stage04Provider';
import { IconClapper, IconFrame, IconNote, IconPencil, IconPlay, IconRefresh } from './icons';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

interface Props {
  projectId: string;
  scene: SceneView;
  index: number;
  sceneNum?: string;
  characters: Character[];
  activeJob: MediaJobRow | null;
  tier: 'economy' | 'premium';
}

type ActionResult = { ok: boolean; error?: string };

const MODEL_LABEL: Record<string, string> = {
  'fal-ai/bytedance/seedance/v1/lite/image-to-video': 'Seedance 1 Lite',
  'fal-ai/kling-video/v2.5-turbo/standard/image-to-video': 'Kling 2.5 Turbo',
  'fal-ai/ltx-video': 'LTX preview',
  'bytedance/seedance-2.0/image-to-video': 'Seedance 2.0 Pro',
  'fal-ai/veo3.1/image-to-video': 'Veo 3.1',
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 'Kling 2.5 Pro',
};

const COST_HINT_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: '$0.18',
  medium: '$0.30',
  high: '$0.40',
};

function speakerLabel(speaker: string): string {
  const norm = speaker.trim().toLowerCase();
  if (!norm || norm === 'narrator' || norm === 'нарратор') return 'рассказчик';
  return speaker;
}

const JOB_KIND_LABEL: Record<string, string> = {
  first_frame: 'кадр',
  video: 'видео',
  voice: 'озвучку',
  final_clip: 'финальный клип',
  last_frame_extract: 'continuity-кадр',
  character_dossier: 'досье персонажа',
  character_avatar: 'аватар персонажа',
  character_reference: 'ref-картинку',
  master_clip: 'master clip',
  storage_mirror: 'mirror в storage',
};

export function SceneSidePanel({ projectId, scene, index, sceneNum, tier, activeJob }: Props) {
  const num = sceneNum ?? String(index + 1).padStart(2, '0');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [promptModal, setPromptModal] = useState<'first_frame' | 'video' | null>(null);

  const activeFrame =
    scene.first_frame_versions.find((v) => v.version_id === scene.first_frame_active_version_id) ??
    null;
  const activeVideo =
    scene.video_versions.find((v) => v.version_id === scene.video_active_version_id) ?? null;

  const isGenerating = !!activeJob && ['pending', 'running'].includes(activeJob.status);
  const genKindLabel = activeJob ? (JOB_KIND_LABEL[activeJob.kind] ?? activeJob.kind) : null;
  const lockedByGen = isGenerating;

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const onAction = (fn: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'unknown');
      else setError(null);
    });
  };

  const videoCostHint = (() => {
    const modelId = scene.config_overrides?.model ?? null;
    if (modelId) {
      const meta = getVideoModelMeta(modelId);
      if (meta) return COST_HINT_LABEL[meta.cost_hint];
    }
    return tier === 'premium' ? '$0.40' : '$0.18';
  })();

  const sceneTitle = (() => {
    const text = scene.description;
    const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
    return firstSentence.length > 90 ? `${firstSentence.slice(0, 88)}…` : firstSentence;
  })();

  return (
    <div className="side-panel" data-scene-id={scene.scene_id}>
      <header className="row-head">
        <span className="scene-mark" aria-hidden>
          {num}
        </span>
        <div className="row-head-title">
          <span className="scene-title-name" title={scene.description}>
            {sceneTitle}
          </span>
        </div>
        <button
          type="button"
          className="tier-toggle"
          title="Сменить тариф для этой сцены"
          onClick={() =>
            onAction(() =>
              setSceneTierAction({
                project_id: projectId,
                scene_id: scene.scene_id,
                tier: tier === 'premium' ? 'economy' : 'premium',
              }),
            )
          }
          disabled={lockedByGen}
        >
          <span className={`tier-dot ${tier}`} aria-hidden />
          {tier === 'premium' ? 'PREMIUM' : 'ECONOMY'}
        </button>
      </header>

      {isGenerating && (
        <div className="gen-banner" role="status" aria-live="polite">
          <span className="spinner inline-spinner" aria-hidden />
          <span className="gen-banner-text">
            <span className="gen-banner-tag">LIVE</span>
            генерируется <strong>{genKindLabel}</strong> · 30-90 секунд · управление залочено
          </span>
        </div>
      )}

      <section className="note-section">
        <div className="note-label">
          <span className="note-label-text">
            <IconNote size={12} className="note-label-icon" />
            Описание · диалог
          </span>
        </div>
        <p className="scene-desc">{scene.description}</p>
        {scene.dialogue && (
          <p className="scene-dialogue">
            <em>«{scene.dialogue.text}»</em>
            <span className="dialogue-speaker">— {speakerLabel(scene.dialogue.speaker)}</span>
          </p>
        )}
      </section>

      <PromptSection
        kind="frame"
        label="Промпт первого кадра"
        prompt={activeFrame?.prompt ?? null}
        version={
          activeFrame ? versionLabel(scene.first_frame_versions, activeFrame.version_id) : null
        }
        onOpen={() => setPromptModal('first_frame')}
        disabled={lockedByGen}
      />

      <PromptSection
        kind="video"
        label="Промпт видео"
        prompt={activeVideo?.prompt ?? null}
        version={activeVideo ? versionLabel(scene.video_versions, activeVideo.version_id) : null}
        onOpen={() => setPromptModal('video')}
        disabled={lockedByGen}
      />

      <section className="action-strip" aria-label="Действия со сценой">
        <ActionTile
          icon={<IconPencil size={13} />}
          label="Перегенерить текст"
          cost="$0.001"
          disabled={pending || lockedByGen}
          onClick={() =>
            onAction(() =>
              regenSceneTextAction({ project_id: projectId, scene_id: scene.scene_id }),
            )
          }
        />
        <ActionTile
          icon={<IconFrame size={13} />}
          label={activeFrame ? 'Перегенерить кадр' : 'Создать кадр'}
          cost="$0.02"
          disabled={pending || lockedByGen}
          onClick={() =>
            onAction(() =>
              generateFirstFrameAction({ project_id: projectId, scene_id: scene.scene_id }),
            )
          }
        />
        <ActionTile
          primary
          icon={activeVideo ? <IconRefresh size={14} /> : <IconPlay size={14} />}
          label={activeVideo ? 'Перегенерить видео' : 'Сгенерировать видео'}
          cost={videoCostHint}
          disabled={pending || lockedByGen || !activeFrame}
          onClick={() =>
            onAction(() =>
              generateSceneVideoAction({ project_id: projectId, scene_id: scene.scene_id }),
            )
          }
          title={!activeFrame ? 'Сначала сгенерируй кадр' : undefined}
        />
      </section>

      <section className="controls-strip" aria-label="Параметры сцены">
        <ModelControl
          projectId={projectId}
          sceneId={scene.scene_id}
          currentModel={scene.config_overrides?.model}
          tier={tier}
          disabled={lockedByGen}
          onError={setError}
        />
        <DurationControl
          projectId={projectId}
          sceneId={scene.scene_id}
          duration={scene.duration_sec}
          disabled={lockedByGen}
        />
        <AudioModeControl
          projectId={projectId}
          sceneId={scene.scene_id}
          mode={scene.audio_mode ?? 'auto'}
          disabled={lockedByGen}
        />
        <ContinuityControl
          projectId={projectId}
          sceneId={scene.scene_id}
          source={scene.first_frame_source}
          index={index}
          disabled={lockedByGen}
        />
        <UploadControl
          projectId={projectId}
          sceneId={scene.scene_id}
          disabled={lockedByGen}
          onError={setError}
        />
      </section>

      {error && (
        <div className="scene-error" role="alert">
          <span className="scene-error-tag">ERR</span> {error}
        </div>
      )}

      {promptModal && (
        <PromptEditorModal
          projectId={projectId}
          sceneId={scene.scene_id}
          kind={promptModal}
          onClose={() => setPromptModal(null)}
        />
      )}
    </div>
  );
}

function versionLabel(
  versions: { version_id: string; generated_at: string }[],
  active_id: string,
): string {
  const idx = versions.findIndex((v) => v.version_id === active_id);
  if (idx < 0) return '';
  return `v${idx + 1}/${versions.length}`;
}

// ---------------- Sub-components ----------------

interface PromptSectionProps {
  kind: 'frame' | 'video';
  label: string;
  prompt: string | null;
  version: string | null;
  onOpen: () => void;
  disabled: boolean;
}

function PromptSection({ kind, label, prompt, version, onOpen, disabled }: PromptSectionProps) {
  const Icon = kind === 'frame' ? IconFrame : IconClapper;
  return (
    <section className="note-section">
      <div className="note-label">
        <span className="note-label-text">
          <Icon size={12} className="note-label-icon" />
          {label}
        </span>
        <span className="note-meta">
          {version && <span className="version-chip">{version}</span>}
          <button
            type="button"
            className="open-btn"
            onClick={onOpen}
            disabled={disabled}
            title="Открыть и редактировать промпт"
          >
            <IconPencil size={11} />
            редактировать
          </button>
        </span>
      </div>
      <p className={`prompt-body${prompt ? '' : ' empty'}`}>
        {prompt ?? '— ещё не сгенерирован —'}
      </p>
    </section>
  );
}

interface ActionTileProps {
  icon: React.ReactNode;
  label: string;
  cost: string;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
  title?: string;
}

function ActionTile({
  icon,
  label,
  cost,
  disabled,
  onClick,
  primary = false,
  title,
}: ActionTileProps) {
  return (
    <button
      type="button"
      className={`action-tile${primary ? ' primary' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <span className="action-tile-icon" aria-hidden>
        {icon}
      </span>
      <span className="action-tile-label">{label}</span>
      <span className="action-tile-cost">{cost}</span>
    </button>
  );
}

interface ModelControlProps {
  projectId: string;
  sceneId: string;
  currentModel: string | undefined;
  tier: 'economy' | 'premium';
  disabled: boolean;
  onError: (msg: string) => void;
}

function ModelControl({
  projectId,
  sceneId,
  currentModel,
  tier,
  disabled,
  onError,
}: ModelControlProps) {
  const [pending, startT] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const models = getActiveVideoModels(tier);
  const currentLabel = currentModel
    ? (MODEL_LABEL[currentModel] ?? currentModel.split('/').pop())
    : 'авто';

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const handleSelect = (model: string) => {
    setOpen(false);
    startT(async () => {
      const r = await setSceneModelAction({ project_id: projectId, scene_id: sceneId, model });
      if (!r.ok && 'error' in r && r.error) onError(r.error);
    });
  };

  return (
    <div className="control" ref={ref}>
      <span className="control-label">Модель</span>
      <button
        type="button"
        className={`control-value${open ? ' open' : ''}`}
        onClick={() => setOpen((x) => !x)}
        disabled={disabled || pending}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {currentLabel}{' '}
        <span className="control-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="control-popover" role="listbox" aria-label="Video model" tabIndex={-1}>
          <div className="popover-head">
            видео-модель · {tier === 'premium' ? 'Premium' : 'Economy'}
          </div>
          {models.map((m) => {
            const meta = getVideoModelMeta(m);
            const isActive = m === currentModel;
            return (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`popover-item${isActive ? ' active' : ''}`}
                onClick={() => handleSelect(m)}
              >
                <span className="popover-item-label">{MODEL_LABEL[m] ?? m.split('/').pop()}</span>
                <span className="popover-item-meta">
                  <span className={`tag${meta?.has_native_audio ? ' tag-audio' : ' tag-silent'}`}>
                    {meta?.has_native_audio ? 'audio' : 'silent'}
                  </span>
                  <span className="tag">{meta && COST_HINT_LABEL[meta.cost_hint]}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DurationControl({
  projectId,
  sceneId,
  duration,
  disabled,
}: {
  projectId: string;
  sceneId: string;
  duration: number;
  disabled: boolean;
}) {
  const [pending, startT] = useTransition();
  const [val, setVal] = useState(duration);
  const id = useId();
  return (
    <div className="control">
      <span className="control-label">Длит.</span>
      <span className="control-value control-value-static">
        <input
          id={id}
          type="number"
          min={1}
          max={30}
          value={val}
          onChange={(e) => setVal(Number(e.target.value))}
          onBlur={() => {
            if (val !== duration) {
              startT(async () => {
                await setSceneDurationAction({
                  project_id: projectId,
                  scene_id: sceneId,
                  duration_sec: val,
                });
              });
            }
          }}
          disabled={disabled || pending}
          className="duration-input"
          aria-label="Длительность сцены, секунд"
        />
        <span className="control-suffix">сек</span>
      </span>
    </div>
  );
}

function AudioModeControl({
  projectId,
  sceneId,
  mode,
  disabled,
}: {
  projectId: string;
  sceneId: string;
  mode: 'native' | 'silent_tts' | 'auto';
  disabled: boolean;
}) {
  const [pending, startT] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const opts: { id: 'auto' | 'native' | 'silent_tts'; label: string; title: string }[] = [
    { id: 'auto', label: 'авто', title: 'Автодетект: кириллица → TTS, иначе native' },
    { id: 'native', label: 'native', title: 'Принудительно native-audio (Seedance 2.0 / Veo)' },
    { id: 'silent_tts', label: 'TTS', title: 'Принудительно silent + ElevenLabs TTS' },
  ];
  const current = opts.find((o) => o.id === mode) ?? opts[0]!;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const handleSelect = (id: 'auto' | 'native' | 'silent_tts') => {
    setOpen(false);
    if (id === mode) return;
    startT(async () => {
      await setSceneAudioModeAction({
        project_id: projectId,
        scene_id: sceneId,
        audio_mode: id,
      });
    });
  };

  return (
    <div className="control" ref={ref}>
      <span className="control-label">Аудио</span>
      <button
        type="button"
        className={`control-value${open ? ' open' : ''}`}
        onClick={() => setOpen((x) => !x)}
        disabled={disabled || pending}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current.label}{' '}
        <span className="control-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          className="control-popover small"
          role="listbox"
          aria-label="Аудио режим"
          tabIndex={-1}
        >
          <div className="popover-head">аудио режим</div>
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={mode === o.id}
              className={`popover-item${mode === o.id ? ' active' : ''}`}
              onClick={() => handleSelect(o.id)}
              title={o.title}
            >
              <span className="popover-item-label">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ContinuityControl({
  projectId,
  sceneId,
  source,
  index,
  disabled,
}: {
  projectId: string;
  sceneId: string;
  source: string;
  index: number;
  disabled: boolean;
}) {
  const [, startT] = useTransition();
  if (index === 0 || source === 'user_upload') return null;
  const isAuto = source === 'auto_continuity';
  return (
    <div className="control">
      <span className="control-label">Кадр-ref</span>
      <button
        type="button"
        className="control-value"
        onClick={() =>
          startT(async () => {
            await toggleSceneContinuityAction({
              project_id: projectId,
              scene_id: sceneId,
              source: isAuto ? 'manual_text2img' : 'auto_continuity',
            });
          })
        }
        title={
          isAuto
            ? 'Continuity: первый кадр = last_frame предыдущей сцены'
            : 'Manual: первый кадр генерируется с нуля'
        }
        disabled={disabled}
      >
        {isAuto ? 'continuity' : 'manual'}{' '}
        <span className="control-caret" aria-hidden>
          ▾
        </span>
      </button>
    </div>
  );
}

function UploadControl({
  projectId,
  sceneId,
  disabled,
  onError,
}: {
  projectId: string;
  sceneId: string;
  disabled: boolean;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleFile = (kind: 'first_frame' | 'video', file: File) => {
    setOpen(false);
    startT(async () => {
      const r = await uploadSceneAssetAction({
        project_id: projectId,
        scene_id: sceneId,
        kind,
        file,
      });
      if (!r.ok && 'error' in r && r.error) onError(r.error);
    });
  };

  return (
    <div className="control" ref={wrapRef}>
      <span className="control-label">Замена</span>
      <button
        type="button"
        className={`control-value${open ? ' open' : ''}`}
        onClick={() => setOpen((x) => !x)}
        disabled={disabled || pending}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {pending ? 'загружаю…' : 'загрузить'}{' '}
        <span className="control-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="control-popover small" role="menu" tabIndex={-1}>
          <div className="popover-head">заменить ассет своим файлом</div>
          <button
            type="button"
            className="popover-item"
            role="menuitem"
            onClick={() => imageRef.current?.click()}
          >
            <span className="popover-item-label">Первый кадр</span>
            <span className="popover-item-meta">
              <span className="tag">PNG · JPG · WEBP</span>
            </span>
          </button>
          <button
            type="button"
            className="popover-item"
            role="menuitem"
            onClick={() => videoRef.current?.click()}
          >
            <span className="popover-item-label">Видео клип</span>
            <span className="popover-item-meta">
              <span className="tag">MP4 · MOV · WEBM</span>
            </span>
          </button>
        </div>
      )}
      <input
        ref={imageRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile('first_frame', f);
          e.target.value = '';
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile('video', f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
