'use client';

import { generateFirstFrameAction } from '@/server/actions/generateFirstFrameAction';
import { generateSceneVideoAction } from '@/server/actions/generateSceneVideoAction';
import { regenSceneTextAction } from '@/server/actions/regenSceneTextAction';
import { setSceneAudioModeAction } from '@/server/actions/setSceneAudioModeAction';
import { setSceneDurationAction } from '@/server/actions/setSceneDurationAction';
import { setSceneTierAction } from '@/server/actions/setSceneTierAction';
import { toggleSceneContinuityAction } from '@/server/actions/toggleSceneContinuityAction';
import type { Character } from '@mango/core';
import { useState, useTransition } from 'react';
import { PromptEditorModal } from './PromptEditorModal';
import type { SceneView } from './Stage04Provider';

interface Props {
  projectId: string;
  scene: SceneView;
  index: number;
  characters: Character[];
  tier: 'economy' | 'premium';
}

type ActionResult = { ok: boolean; error?: string };

export function SceneSidePanel({ projectId, scene, index, tier }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [promptModal, setPromptModal] = useState<'first_frame' | 'video' | null>(null);

  const activeFrame =
    scene.first_frame_versions.find(
      (v) => v.version_id === scene.first_frame_active_version_id,
    ) ?? null;
  const activeVideo =
    scene.video_versions.find((v) => v.version_id === scene.video_active_version_id) ?? null;

  const onAction = (fn: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'unknown');
      else setError(null);
    });
  };

  return (
    <div className="side-panel">
      {/* Header */}
      <div className="row-head">
        <span className="scene-num">#{index + 1}</span>
        <span className="scene-name">{scene.description.slice(0, 40)}...</span>
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
        >
          {tier === 'premium' ? '💎 Премиум' : '🪙 Эконом'} ▾
        </button>
      </div>

      {/* Description + dialogue */}
      <div className="sect">
        <div className="sect-label">📝 ОПИСАНИЕ + ДИАЛОГ</div>
        <div className="sect-body">
          «{scene.description}»
          {scene.dialogue && (
            <p>
              <strong>{scene.dialogue.speaker}:</strong> «{scene.dialogue.text}»
            </p>
          )}
        </div>
      </div>

      {/* Frame prompt */}
      <div className="sect">
        <div className="sect-label">
          🖼️ ПРОМПТ ПЕРВОГО КАДРА
          <button
            type="button"
            className="icon-btn"
            onClick={() => setPromptModal('first_frame')}
          >
            ✏️ открыть
          </button>
        </div>
        <div className="prompt-text">{activeFrame?.prompt ?? '— ещё не сгенерирован —'}</div>
      </div>

      {/* Video prompt */}
      <div className="sect">
        <div className="sect-label">
          🎬 ПРОМПТ ВИДЕО
          <button type="button" className="icon-btn" onClick={() => setPromptModal('video')}>
            ✏️ открыть
          </button>
        </div>
        <div className="prompt-text">{activeVideo?.prompt ?? '— ещё не сгенерировано —'}</div>
      </div>

      {/* Action row */}
      <div className="action-row">
        <button
          type="button"
          className="btn"
          onClick={() =>
            onAction(() =>
              regenSceneTextAction({ project_id: projectId, scene_id: scene.scene_id }),
            )
          }
          disabled={pending}
        >
          ✏️ Текст
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            onAction(() =>
              generateFirstFrameAction({ project_id: projectId, scene_id: scene.scene_id }),
            )
          }
          disabled={pending}
        >
          🖼️ Кадр
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            onAction(() =>
              generateSceneVideoAction({ project_id: projectId, scene_id: scene.scene_id }),
            )
          }
          disabled={pending || !activeFrame}
        >
          🎬 Видео
        </button>
      </div>

      {/* Controls row */}
      <div className="controls-row">
        <ModelPill model={scene.config_overrides?.model} />
        <DurationPill
          projectId={projectId}
          sceneId={scene.scene_id}
          duration={scene.duration_sec}
        />
        <AudioModePill
          projectId={projectId}
          sceneId={scene.scene_id}
          mode={scene.audio_mode ?? 'auto'}
        />
        <ContinuityPill
          projectId={projectId}
          sceneId={scene.scene_id}
          source={scene.first_frame_source}
          index={index}
        />
        <UploadPill />
      </div>

      {error && <div className="scene-error">⚠ {error}</div>}

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

// ---------------- Inline pill components ----------------

function ModelPill({ model }: { model: string | undefined }) {
  // MVP — popover deferred; clicking is a no-op for now. Sub-phase F may extend.
  return (
    <button type="button" className="pill" onClick={() => undefined}>
      🎬 {model ? (model.split('/').at(-1) ?? 'авто') : 'авто'} ▾
    </button>
  );
}

function DurationPill({
  projectId,
  sceneId,
  duration,
}: {
  projectId: string;
  sceneId: string;
  duration: number;
}) {
  const [pending, startT] = useTransition();
  const [val, setVal] = useState(duration);
  return (
    <span className="pill">
      ⏱{' '}
      <input
        type="number"
        min={1}
        max={30}
        value={val}
        onChange={(e) => {
          const v = Number(e.target.value);
          setVal(v);
          startT(async () => {
            await setSceneDurationAction({
              project_id: projectId,
              scene_id: sceneId,
              duration_sec: v,
            });
          });
        }}
        disabled={pending}
        className="duration-input"
        aria-label="Длительность сцены, секунд"
      />{' '}
      с
    </span>
  );
}

function AudioModePill({
  projectId,
  sceneId,
  mode,
}: {
  projectId: string;
  sceneId: string;
  mode: 'native' | 'silent_tts' | 'auto';
}) {
  const [, startT] = useTransition();
  const next = mode === 'auto' ? 'native' : mode === 'native' ? 'silent_tts' : 'auto';
  const label = mode === 'native' ? '🎵 native' : mode === 'silent_tts' ? '🔇 TTS' : '🤖 auto';
  return (
    <button
      type="button"
      className="pill"
      onClick={() =>
        startT(async () => {
          await setSceneAudioModeAction({
            project_id: projectId,
            scene_id: sceneId,
            audio_mode: next,
          });
        })
      }
      title={`Audio mode: ${mode}`}
    >
      {label} ▾
    </button>
  );
}

function ContinuityPill({
  projectId,
  sceneId,
  source,
  index,
}: {
  projectId: string;
  sceneId: string;
  source: string;
  index: number;
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
      title={isAuto ? 'Auto continuity' : 'Manual start'}
    >
      🔗 {isAuto ? 'авто' : 'manual'}
    </button>
  );
}

function UploadPill() {
  // MVP — upload menu deferred; renders inert pill. Sub-phase E or G may
  // extend with image/video file pickers wired to uploadSceneAssetAction.
  return <span className="pill">⬆ upload</span>;
}
