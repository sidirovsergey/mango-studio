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

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

interface Props {
  projectId: string;
  scene: SceneView;
  index: number;
  characters: Character[];
  activeJob: MediaJobRow | null;
  tier: 'economy' | 'premium';
}

type ActionResult = { ok: boolean; error?: string };

const MODEL_LABEL: Record<string, string> = {
  'fal-ai/bytedance/seedance/v1/lite/image-to-video': 'Seedance 1 Lite',
  'fal-ai/kling-video/v2.5-turbo/standard/image-to-video': 'Kling 2.5 Turbo',
  'fal-ai/ltx-video': 'LTX (preview)',
  'bytedance/seedance-2.0/image-to-video': 'Seedance 2.0 Pro',
  'fal-ai/veo3.1/image-to-video': 'Veo 3.1',
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 'Kling 2.5 Turbo Pro',
};

const COST_HINT_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: '~$0.18',
  medium: '~$0.30',
  high: '~$0.40',
};

const JOB_KIND_LABEL: Record<string, string> = {
  first_frame: 'первый кадр',
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

export function SceneSidePanel({ projectId, scene, index, tier, activeJob }: Props) {
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
    return tier === 'premium' ? '~$0.40' : '~$0.18';
  })();

  return (
    <div className="side-panel" data-scene-id={scene.scene_id}>
      <div className="row-head">
        <span className="scene-num">#{index + 1}</span>
        <span className="scene-name" title={scene.description}>
          {scene.description.slice(0, 64)}
          {scene.description.length > 64 ? '…' : ''}
        </span>
        <button
          type="button"
          className="ml-auto pill tier-toggle"
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
          {tier === 'premium' ? '💎 Премиум' : '🪙 Эконом'} ▾
        </button>
      </div>

      {isGenerating && (
        <div className="gen-banner" role="status" aria-live="polite">
          <span className="spinner inline-spinner" aria-hidden />
          <span className="gen-banner-text">
            Генерируется <strong>{genKindLabel}</strong> — обычно 30-90 секунд. Управление сценой
            заблокировано до завершения.
          </span>
        </div>
      )}

      <div className="sect">
        <div className="sect-label">📝 Описание + диалог</div>
        <div className="sect-body">
          «{scene.description}»
          {scene.dialogue && (
            <p className="dialogue">
              <strong>{scene.dialogue.speaker}:</strong> «{scene.dialogue.text}»
            </p>
          )}
        </div>
      </div>

      <PromptSection
        label="🖼️ Промпт первого кадра"
        prompt={activeFrame?.prompt ?? null}
        version={
          activeFrame ? versionLabel(scene.first_frame_versions, activeFrame.version_id) : null
        }
        onOpen={() => setPromptModal('first_frame')}
        disabled={lockedByGen}
      />

      <PromptSection
        label="🎬 Промпт видео"
        prompt={activeVideo?.prompt ?? null}
        version={activeVideo ? versionLabel(scene.video_versions, activeVideo.version_id) : null}
        onOpen={() => setPromptModal('video')}
        disabled={lockedByGen}
      />

      <div className="action-row" role="group" aria-label="Действия со сценой">
        <ActionButton
          icon="✏️"
          label="Переписать текст"
          sub="через LLM · ~$0.001"
          disabled={pending || lockedByGen}
          onClick={() =>
            onAction(() =>
              regenSceneTextAction({ project_id: projectId, scene_id: scene.scene_id }),
            )
          }
          variant="ghost"
        />
        <ActionButton
          icon="🖼️"
          label={activeFrame ? 'Перегенерить кадр' : 'Сгенерировать кадр'}
          sub="~$0.02 · nano-banana"
          disabled={pending || lockedByGen}
          onClick={() =>
            onAction(() =>
              generateFirstFrameAction({ project_id: projectId, scene_id: scene.scene_id }),
            )
          }
          variant="ghost"
        />
        <ActionButton
          icon="🎬"
          label={activeVideo ? 'Перегенерить видео' : 'Сгенерировать видео'}
          sub={activeFrame ? `${videoCostHint} · самая дорогая операция` : 'нужен first_frame'}
          disabled={pending || lockedByGen || !activeFrame}
          onClick={() =>
            onAction(() =>
              generateSceneVideoAction({ project_id: projectId, scene_id: scene.scene_id }),
            )
          }
          variant="destructive"
          title={!activeFrame ? 'Сначала сгенерируй кадр' : 'Видео — самая дорогая операция'}
        />
      </div>

      <div className="controls-row">
        <ModelPill
          projectId={projectId}
          sceneId={scene.scene_id}
          currentModel={scene.config_overrides?.model}
          tier={tier}
          disabled={lockedByGen}
          onError={setError}
        />
        <DurationPill
          projectId={projectId}
          sceneId={scene.scene_id}
          duration={scene.duration_sec}
          disabled={lockedByGen}
        />
        <AudioModePill
          projectId={projectId}
          sceneId={scene.scene_id}
          mode={scene.audio_mode ?? 'auto'}
          disabled={lockedByGen}
        />
        <ContinuityPill
          projectId={projectId}
          sceneId={scene.scene_id}
          source={scene.first_frame_source}
          index={index}
          disabled={lockedByGen}
        />
        <UploadPill
          projectId={projectId}
          sceneId={scene.scene_id}
          disabled={lockedByGen}
          onError={setError}
        />
      </div>

      {error && (
        <div className="scene-error" role="alert">
          ⚠ {error}
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
  label: string;
  prompt: string | null;
  version: string | null;
  onOpen: () => void;
  disabled: boolean;
}

function PromptSection({ label, prompt, version, onOpen, disabled }: PromptSectionProps) {
  return (
    <div className="sect">
      <div className="sect-label">
        <span>{label}</span>
        <div className="sect-label-right">
          {version && <span className="sect-version">{version}</span>}
          <button
            type="button"
            className="icon-btn"
            onClick={onOpen}
            disabled={disabled}
            title="Открыть полный промпт + редактировать"
          >
            ✏️ Открыть
          </button>
        </div>
      </div>
      <div className="prompt-text" aria-label={label}>
        {prompt ?? '— ещё не сгенерировано —'}
      </div>
    </div>
  );
}

interface ActionButtonProps {
  icon: string;
  label: string;
  sub: string;
  variant: 'ghost' | 'destructive';
  disabled: boolean;
  title?: string;
  onClick: () => void;
}

function ActionButton({ icon, label, sub, variant, disabled, title, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={`gen-btn gen-btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <span className="gen-btn-icon" aria-hidden>
        {icon}
      </span>
      <span className="gen-btn-body">
        <span className="gen-btn-label">{label}</span>
        <span className="gen-btn-sub">{sub}</span>
      </span>
    </button>
  );
}

interface ModelPillProps {
  projectId: string;
  sceneId: string;
  currentModel: string | undefined;
  tier: 'economy' | 'premium';
  disabled: boolean;
  onError: (msg: string) => void;
}

function ModelPill({ projectId, sceneId, currentModel, tier, disabled, onError }: ModelPillProps) {
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
    <div className="pill-wrap" ref={ref}>
      <button
        type="button"
        className={`pill pill-model${open ? ' open' : ''}`}
        onClick={() => setOpen((x) => !x)}
        disabled={disabled || pending}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        🎬 {currentLabel} ▾
      </button>
      {open && (
        <div className="pill-popover" role="listbox" aria-label="Video model" tabIndex={-1}>
          <div className="popover-head">
            Модель видео · {tier === 'premium' ? 'Премиум' : 'Эконом'}
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
                <span className="item-label">{MODEL_LABEL[m] ?? m.split('/').pop()}</span>
                <span className="item-meta">
                  {meta?.has_native_audio ? '🎵' : '🔇'} {meta && COST_HINT_LABEL[meta.cost_hint]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DurationPill({
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
    <label className="pill pill-duration" htmlFor={id}>
      ⏱{' '}
      <input
        id={id}
        type="number"
        min={1}
        max={30}
        value={val}
        onChange={(e) => {
          const v = Number(e.target.value);
          setVal(v);
        }}
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
      />{' '}
      сек
    </label>
  );
}

function AudioModePill({
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
  const [, startT] = useTransition();
  const opts: { id: 'auto' | 'native' | 'silent_tts'; label: string; title: string }[] = [
    { id: 'auto', label: '🤖 auto', title: 'Автодетект: кириллица → TTS, иначе native' },
    { id: 'native', label: '🎵 native', title: 'Принудительно использовать native-audio модель' },
    { id: 'silent_tts', label: '🔇 TTS', title: 'Принудительно silent video + ElevenLabs TTS' },
  ];
  return (
    <div className="pill-segment" role="group" aria-label="Аудио режим">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`pill-seg-item${mode === o.id ? ' active' : ''}`}
          disabled={disabled || mode === o.id}
          title={o.title}
          onClick={() =>
            startT(async () => {
              await setSceneAudioModeAction({
                project_id: projectId,
                scene_id: sceneId,
                audio_mode: o.id,
              });
            })
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ContinuityPill({
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
    <button
      type="button"
      className="pill"
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
          ? 'Continuity: первый кадр — last_frame предыдущей сцены'
          : 'Manual: первый кадр генерируется с нуля'
      }
      disabled={disabled}
    >
      🔗 {isAuto ? 'continuity' : 'manual start'}
    </button>
  );
}

function UploadPill({
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
    <div className="pill-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`pill${open ? ' open' : ''}`}
        onClick={() => setOpen((x) => !x)}
        disabled={disabled || pending}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⬆ {pending ? 'загружаю…' : 'загрузить'}
      </button>
      {open && (
        <div className="pill-popover small" role="menu" tabIndex={-1}>
          <div className="popover-head">Заменить ассет</div>
          <button
            type="button"
            className="popover-item"
            role="menuitem"
            onClick={() => imageRef.current?.click()}
          >
            <span className="item-label">🖼️ Свой первый кадр</span>
            <span className="item-meta">PNG/JPG</span>
          </button>
          <button
            type="button"
            className="popover-item"
            role="menuitem"
            onClick={() => videoRef.current?.click()}
          >
            <span className="item-label">🎬 Своё видео</span>
            <span className="item-meta">MP4/MOV</span>
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
