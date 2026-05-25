'use client';

import { useInsufficientBalance } from '@/components/account/InsufficientBalanceProvider';
import { useTierGate } from '@/components/account/TierGateProvider';
import {
  type MediaJobUiRow,
  type SceneView,
  useScriptState,
} from '@/components/workspace/ScriptStateProvider';
import { generateFirstFrameAction } from '@/server/actions/generateFirstFrameAction';
import { generateSceneVideoAction } from '@/server/actions/generateSceneVideoAction';
import { regenSceneTextAction } from '@/server/actions/regenSceneTextAction';
import { setSceneDurationAction } from '@/server/actions/setSceneDurationAction';
import { setSceneModelAction } from '@/server/actions/setSceneModelAction';
import { setSceneTierAction } from '@/server/actions/setSceneTierAction';
import { toggleSceneContinuityAction } from '@/server/actions/toggleSceneContinuityAction';
import { uploadSceneAssetAction } from '@/server/actions/uploadSceneAssetAction';
import { type Character, getActiveVideoModels, getVideoModelMeta } from '@mango/core';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { PromptEditorModal } from './PromptEditorModal';
import { IconClapper, IconFrame, IconNote, IconPencil, IconPlay, IconRefresh } from './icons';

interface Props {
  projectId: string;
  scene: SceneView;
  index: number;
  sceneNum?: string;
  characters: Character[];
  activeJob: MediaJobUiRow | null;
  tier: 'economy' | 'premium';
}

type ActionResult =
  | { ok: boolean; error?: string }
  | {
      ok: false;
      error: 'tier_gate';
      tier_gate: {
        required_tier: import('@mango/core').AccountTier;
        kind: import('@mango/core').MediaJobKind;
        message: string;
      };
    }
  | {
      ok: false;
      error: 'insufficient_balance';
      insufficient_balance: {
        kind: import('@mango/core').MediaJobKind;
        required_kopeks: number;
        current_kopeks: number;
      };
    };

const MODEL_LABEL: Record<string, string> = {
  // Active (native-audio only after 2026-05-13)
  'xai/grok-imagine-video/image-to-video': 'Grok Imagine Video',
  'bytedance/seedance-2.0/image-to-video': 'Seedance 2.0 Pro',
  'fal-ai/veo3.1/image-to-video': 'Veo 3.1',
  // Legacy — kept only so old scenes still render a friendly name
  'fal-ai/bytedance/seedance/v1/lite/image-to-video': 'Seedance 1 Lite (legacy)',
  'fal-ai/kling-video/v2.5-turbo/standard/image-to-video': 'Kling 2.5 Turbo (legacy)',
  'fal-ai/ltx-video': 'LTX preview (legacy)',
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 'Kling 2.5 Pro (legacy)',
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

type ActionId = 'text' | 'frame' | 'video';

export function SceneSidePanel({
  projectId,
  scene,
  index,
  sceneNum,
  tier,
  characters,
  activeJob,
}: Props) {
  const num = sceneNum ?? String(index + 1).padStart(2, '0');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [promptModal, setPromptModal] = useState<'first_frame' | 'video' | null>(null);
  const [activeAction, setActiveAction] = useState<ActionId | null>(null);
  const { prospectivePrompts } = useScriptState();
  const { open: openTierGate } = useTierGate();
  const { open: openInsufficientBalance } = useInsufficientBalance();
  const router = useRouter();

  // Lifted optimistic model state. Owned here (not in ModelControl) so the
  // same `effectiveModel` value feeds BOTH the dropdown label AND the
  // model_override argument of generateSceneVideoAction below. Otherwise a
  // user could pick model M2 and immediately click «Сгенерировать» — the
  // video action would still see scene.config_overrides.model = M1 (stale
  // until setSceneModelAction's router.refresh lands ~500ms-1s later).
  // Counter ref enforces last-select-wins: rapid M1→M2 selects can't have
  // M1's resolution clear M2's pending state (Codex audit re-pass 2026-05-25).
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [modelPending, modelStartT] = useTransition();
  const modelSelectIdRef = useRef(0);
  const effectiveModel = pendingModel ?? scene.config_overrides?.model;

  useEffect(() => {
    if (pendingModel && scene.config_overrides?.model === pendingModel) {
      setPendingModel(null);
    }
  }, [scene.config_overrides?.model, pendingModel]);

  const handleSelectModel = (model: string) => {
    const myId = ++modelSelectIdRef.current;
    setPendingModel(model);
    modelStartT(async () => {
      const r = await setSceneModelAction({
        project_id: projectId,
        scene_id: scene.scene_id,
        model,
      });
      // Stale response — a newer select has superseded this one. Ignore.
      if (myId !== modelSelectIdRef.current) return;
      if (!r.ok && 'error' in r && r.error) {
        setError(r.error);
        setPendingModel(null);
        return;
      }
      router.refresh();
    });
  };

  // F53 UI gate — mirror the server-side hard precondition in
  // generateFirstFrameAction so the "Кадр" tile is visibly disabled while the
  // reference_image chain is in flight. Without this, the user clicks an
  // enabled-looking button and only then sees the retry-message toast. Paired
  // with the retroactive trigger in pollMediaJobsAction so the gate eventually
  // clears without requiring user intervention.
  const charsNeedingRef = characters
    .filter((c) => scene.character_ids.includes(c.id))
    .filter((c) => c.dossier && !c.dossier.reference_image);
  const refNotReady = charsNeedingRef.length > 0;
  const refNotReadyTitle = refNotReady
    ? `Готовлю reference-картинку: ${charsNeedingRef.map((c) => c.name).join(', ')}. Подожди ~20-30с.`
    : null;

  const activeFrame =
    scene.first_frame_versions.find((v) => v.version_id === scene.first_frame_active_version_id) ??
    null;
  const activeVideo =
    scene.video_versions.find((v) => v.version_id === scene.video_active_version_id) ?? null;

  // Pre-built (prospective) prompts come from the ScriptStateProvider batch cache;
  // they refresh on every poll-tick alongside the script. When no version is
  // generated yet, surface this draft so the user can read + edit it inline.
  const sceneProspective = prospectivePrompts?.[scene.scene_id] ?? null;
  const frameProspective = sceneProspective?.first_frame?.prompt ?? null;
  const videoProspective = sceneProspective?.video?.prompt ?? null;

  // Include 'reserved' (the brief window between reserveMediaJob writing the
  // row and finalize flipping it to 'pending' after fal submit) so the side
  // panel locks controls immediately on click. Without this the user could
  // double-click "Сгенерировать видео" mid-submit. Matches the inflight set
  // in Stage04Inline jobsByScene and SceneThumbnailColumn isActiveJob.
  const isGenerating = !!activeJob && ['reserved', 'pending', 'running'].includes(activeJob.status);
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
  const runScopedAction = (id: ActionId, fn: () => Promise<ActionResult>) => {
    setActiveAction(id);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        if (r.error === 'insufficient_balance' && 'insufficient_balance' in r) {
          openInsufficientBalance({
            kind: r.insufficient_balance.kind,
            required_kopeks: r.insufficient_balance.required_kopeks,
            current_kopeks: r.insufficient_balance.current_kopeks,
          });
          setActiveAction(null);
          return;
        }
        if (r.error === 'tier_gate' && 'tier_gate' in r) {
          openTierGate({ kind: r.tier_gate.kind, required_tier: r.tier_gate.required_tier });
          setActiveAction(null);
          return;
        }
        setError(r.error ?? 'unknown');
      } else {
        setError(null);
      }
      setActiveAction(null);
    });
  };

  const videoCostHint = (() => {
    const modelId = scene.config_overrides?.model ?? null;
    const modelMeta = modelId ? getVideoModelMeta(modelId) : null;
    if (modelMeta) return COST_HINT_LABEL[modelMeta.cost_hint];
    return tier === 'premium' ? '$0.40' : '$0.50';
  })();
  // Note (2026-05-13): silent_tts → TTS-mux cost line removed alongside the
  // audio pipeline rip-out. All active video models now carry native audio,
  // so there's no separate audio cost to surface. Legacy scenes that still
  // hold a silent_tts model render with the base label only.

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
        {/* Phase 1.8.0a: prefer description_ru when present (Russian-canonical
           UI). For symmetric legacy projects (description == description_ru)
           this is bit-identical. For asymmetric edge case it picks the RU body
           — see docs/audits/1.8.0a-stage-script-behavior-shift.md. */}
        <p className="scene-desc">
          {(scene as { description_ru?: string }).description_ru ?? scene.description}
        </p>
        {/* Phase 1.8.0a: future schema may carry dialogue as an array. Wrap
           the legacy single|null shape in an array view so 1.8.0b's
           dialogue[] just works without further changes here. */}
        {(() => {
          const lines = Array.isArray(scene.dialogue)
            ? scene.dialogue
            : scene.dialogue
              ? [scene.dialogue]
              : [];
          if (lines.length === 0) return null;
          return (
            <div className="scene-dialogue-list">
              {lines.map((d, i) => (
                <p key={`${scene.scene_id}-dlg-${i}-${d.speaker}`} className="scene-dialogue">
                  <em>«{d.text}»</em>
                  <span className="dialogue-speaker">— {speakerLabel(d.speaker)}</span>
                </p>
              ))}
            </div>
          );
        })()}
      </section>

      <PromptSection
        kind="frame"
        label="Промпт первого кадра"
        prompt={activeFrame?.prompt ?? frameProspective}
        isProspective={!activeFrame && !!frameProspective}
        version={
          activeFrame ? versionLabel(scene.first_frame_versions, activeFrame.version_id) : null
        }
        onOpen={() => setPromptModal('first_frame')}
        disabled={lockedByGen}
      />

      <PromptSection
        kind="video"
        label="Промпт видео"
        prompt={activeVideo?.prompt ?? videoProspective}
        isProspective={!activeVideo && !!videoProspective}
        version={activeVideo ? versionLabel(scene.video_versions, activeVideo.version_id) : null}
        onOpen={() => setPromptModal('video')}
        disabled={lockedByGen}
      />

      <section className="action-strip" aria-label="Действия со сценой">
        <ActionTile
          icon={<IconPencil size={16} />}
          object="Текст"
          action="перегенерировать"
          cost="$0.001"
          busy={activeAction === 'text'}
          disabled={pending || lockedByGen}
          title="LLM перепишет описание сцены и реплику диалога"
          onClick={() =>
            runScopedAction('text', () =>
              regenSceneTextAction({ project_id: projectId, scene_id: scene.scene_id }),
            )
          }
        />
        <ActionTile
          icon={<IconFrame size={16} />}
          object="Кадр"
          action={activeFrame ? 'перегенерировать' : 'создать'}
          cost="$0.02"
          busy={activeAction === 'frame'}
          disabled={pending || lockedByGen || refNotReady}
          title={
            refNotReadyTitle ??
            (activeFrame
              ? 'Сгенерировать новую версию first_frame (9:16) — заменит текущую активную'
              : 'Сгенерировать первый кадр сцены (9:16) для последующего video-генератора')
          }
          onClick={() =>
            runScopedAction('frame', () =>
              generateFirstFrameAction({ project_id: projectId, scene_id: scene.scene_id }),
            )
          }
        />
        <ActionTile
          primary
          icon={activeVideo ? <IconRefresh size={17} /> : <IconPlay size={17} />}
          object="Видео"
          action={activeVideo ? 'перегенерировать' : 'сгенерировать'}
          cost={videoCostHint}
          busy={activeAction === 'video'}
          disabled={pending || lockedByGen || !activeFrame}
          title={
            !activeFrame
              ? 'Сначала сгенерируй кадр — нужен first_frame для image-to-video'
              : activeVideo
                ? `Создать новую версию видео из активного кадра (${videoCostHint})`
                : `Сгенерировать видео сцены из активного кадра (${videoCostHint})`
          }
          onClick={() =>
            runScopedAction('video', () =>
              generateSceneVideoAction({
                project_id: projectId,
                scene_id: scene.scene_id,
                // Use the lifted effectiveModel so an in-flight model select
                // still reaches fal.ai even if setSceneModelAction hasn't
                // finished its router.refresh yet.
                ...(effectiveModel ? { model_override: effectiveModel } : {}),
              }),
            )
          }
        />
      </section>

      <section className="controls-strip" aria-label="Параметры сцены">
        <ModelControl
          effectiveModel={effectiveModel}
          tier={tier}
          disabled={lockedByGen}
          pending={modelPending}
          onSelect={handleSelectModel}
        />
        <DurationControl
          projectId={projectId}
          sceneId={scene.scene_id}
          duration={scene.duration_sec}
          disabled={lockedByGen}
        />
        {/*
          AudioModeControl removed 2026-05-13 — all active video models now
          generate native audio, so the 'auto' resolver always picks 'native'.
          The field stays on the scene jsonb for back-compat; the toggle's gone.
        */}
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
  /** True when `prompt` is the prospective draft (no version generated yet). */
  isProspective?: boolean;
  version: string | null;
  onOpen: () => void;
  disabled: boolean;
}

function PromptSection({
  kind,
  label,
  prompt,
  isProspective,
  version,
  onOpen,
  disabled,
}: PromptSectionProps) {
  const Icon = kind === 'frame' ? IconFrame : IconClapper;
  return (
    <section className="note-section">
      <div className="note-label">
        <span className="note-label-text">
          <Icon size={12} className="note-label-icon" />
          {label}
        </span>
        <span className="note-meta">
          {version ? (
            <span className="version-chip">{version}</span>
          ) : (
            isProspective && <span className="prospective-tag">черновик</span>
          )}
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
        {prompt ?? '— ещё не сгенерирован. Нажми «редактировать» чтобы открыть черновик. —'}
      </p>
    </section>
  );
}

interface ActionTileProps {
  icon: React.ReactNode;
  /** What the button generates: "Текст" / "Кадр" / "Видео". Top line, bold. */
  object: string;
  /** Action verb: "перегенерировать" / "создать". Bottom line, muted mono. */
  action: string;
  cost: string;
  disabled: boolean;
  /** True only for the currently running tile — shows spinner + "Генерирую…". */
  busy: boolean;
  onClick: () => void;
  primary?: boolean;
  /** Native title tooltip — explain what this button does. */
  title?: string;
}

function ActionTile({
  icon,
  object,
  action,
  cost,
  disabled,
  busy,
  onClick,
  primary = false,
  title,
}: ActionTileProps) {
  const cls = `action-tile${primary ? ' primary' : ''}${busy ? ' busy' : ''}`;
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      aria-busy={busy}
    >
      <span className="action-tile-icon" aria-hidden>
        {busy ? <span className="spinner inline-spinner" /> : icon}
      </span>
      <span className="action-tile-body">
        <span className="action-tile-object">{busy ? 'Генерирую…' : object}</span>
        <span className="action-tile-action">{busy ? object.toLowerCase() : action}</span>
      </span>
      <span className="action-tile-cost">{cost}</span>
    </button>
  );
}

interface ModelControlProps {
  effectiveModel: string | undefined;
  tier: 'economy' | 'premium';
  disabled: boolean;
  pending: boolean;
  onSelect: (model: string) => void;
}

/**
 * Dumb dropdown — owns only open/close + click-outside. Effective model and
 * the actual setSceneModelAction call live in the SceneSidePanel parent so
 * the same `effectiveModel` value can ALSO be passed to generateSceneVideoAction
 * as model_override. Without that lift, a user could pick a new model and
 * immediately click «Сгенерировать», sending the action with the stale model
 * still in scene.config_overrides (Codex audit re-pass 2026-05-25).
 */
function ModelControl({ effectiveModel, tier, disabled, pending, onSelect }: ModelControlProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const models = getActiveVideoModels(tier);
  const currentLabel = effectiveModel
    ? (MODEL_LABEL[effectiveModel] ?? effectiveModel.split('/').pop())
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
    onSelect(model);
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
            const isActive = m === effectiveModel;
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

// AudioModeControl removed 2026-05-13 — all active models carry native audio,
// so the override is meaningless. Component definition deleted alongside its
// render site; setSceneAudioModeAction kept on the server in case any old
// Director-tool prompt still calls it (returns ok+no-op on native mode).

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
