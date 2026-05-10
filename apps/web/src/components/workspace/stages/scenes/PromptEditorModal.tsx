'use client';

import { generateFirstFrameAction } from '@/server/actions/generateFirstFrameAction';
import { generateSceneVideoAction } from '@/server/actions/generateSceneVideoAction';
import { useEffect, useState, useTransition } from 'react';
import { useStage04 } from './Stage04Provider';

type Kind = 'first_frame' | 'video';

interface Props {
  projectId: string;
  sceneId: string;
  kind: Kind;
  onClose: () => void;
}

export function PromptEditorModal({ projectId, sceneId, kind, onClose }: Props) {
  const { script } = useStage04();
  const scene = script?.scenes.find((s) => s.scene_id === sceneId);

  const versions = kind === 'first_frame' ? scene?.first_frame_versions : scene?.video_versions;
  const activeId =
    kind === 'first_frame' ? scene?.first_frame_active_version_id : scene?.video_active_version_id;
  const active = versions?.find((v) => v.version_id === activeId) ?? null;

  const [text, setText] = useState(active?.prompt ?? '');
  const [pending, startT] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(active?.prompt ?? '');
  }, [active?.prompt]);

  // Esc / backdrop close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!scene) return null;

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  const handleApply = () => {
    setError(null);
    startT(async () => {
      const fn = kind === 'first_frame' ? generateFirstFrameAction : generateSceneVideoAction;
      const r = await fn({
        project_id: projectId,
        scene_id: sceneId,
        prompt_override: text,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });
  };

  return (
    <div
      className="prompt-modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="presentation"
    >
      <div
        className="prompt-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Prompt editor"
      >
        <div className="modal-head">
          <h3>{kind === 'first_frame' ? '🖼️ Промпт первого кадра' : '🎬 Промпт видео'}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <textarea
          className="prompt-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          spellCheck={false}
        />
        <div className="modal-meta">
          {wordCount} слов · модель: {active?.model ?? '—'}
        </div>
        {error && <div className="modal-error">⚠ {error}</div>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={handleApply}
            disabled={pending || text.trim().length === 0}
          >
            {pending ? '...' : '▶ Применить и regen'}
          </button>
        </div>
      </div>
    </div>
  );
}
