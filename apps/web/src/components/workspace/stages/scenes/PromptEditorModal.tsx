'use client';

import { useTierGate } from '@/components/account/TierGateProvider';
import { buildProspectivePromptAction } from '@/server/actions/buildProspectivePromptAction';
import { generateFirstFrameAction } from '@/server/actions/generateFirstFrameAction';
import { generateSceneVideoAction } from '@/server/actions/generateSceneVideoAction';
import type { AccountTier, MediaJobKind } from '@mango/core';
import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useStage04 } from './Stage04Provider';

type TierGatePayload = { required_tier: AccountTier; kind: MediaJobKind; message: string };

type Kind = 'first_frame' | 'video';

interface Props {
  projectId: string;
  sceneId: string;
  kind: Kind;
  onClose: () => void;
}

export function PromptEditorModal({ projectId, sceneId, kind, onClose }: Props) {
  const { script } = useStage04();
  const { open: openTierGate } = useTierGate();
  const scene = script?.scenes.find((s) => s.scene_id === sceneId);

  const versions = kind === 'first_frame' ? scene?.first_frame_versions : scene?.video_versions;
  const activeId =
    kind === 'first_frame' ? scene?.first_frame_active_version_id : scene?.video_active_version_id;
  const active = versions?.find((v) => v.version_id === activeId) ?? null;

  const [text, setText] = useState(active?.prompt ?? '');
  const [pending, startT] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isProspective, setIsProspective] = useState<boolean>(!active);
  const [prospectiveModel, setProspectiveModel] = useState<string | null>(null);
  const [prospectiveLoading, setProspectiveLoading] = useState<boolean>(false);

  // Sync text from the active version's prompt when it lands.
  useEffect(() => {
    if (active?.prompt) {
      setText(active.prompt);
      setIsProspective(false);
    }
  }, [active?.prompt]);

  // No version yet → fetch the prospective prompt the generator *would*
  // build right now so the user can preview and edit before clicking
  // "Apply & generate". Mirrors generateFirstFrameAction / generateSceneVideoAction
  // exactly via buildProspectivePromptAction, so editing is honest: what you
  // see is what the engine receives (minus your edits).
  useEffect(() => {
    if (active) return; // already have a real version
    let cancelled = false;
    setProspectiveLoading(true);
    void buildProspectivePromptAction({
      project_id: projectId,
      scene_id: sceneId,
      kind,
    }).then((r) => {
      if (cancelled) return;
      setProspectiveLoading(false);
      if (r.ok) {
        setText(r.prompt);
        setIsProspective(true);
        setProspectiveModel(r.model);
      }
      // Error path: leave textarea empty — the user can still type their own
      // prompt. We don't surface a hard error here because the build can fail
      // legitimately for video-without-first_frame in some configs, and
      // the side-panel will guide the user instead.
    });
    return () => {
      cancelled = true;
    };
  }, [active, projectId, sceneId, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!scene) return null;
  if (typeof document === 'undefined') return null;

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
        if (r.error === 'tier_gate' && 'tier_gate' in r) {
          const tg = (r as { ok: false; error: 'tier_gate'; tier_gate: TierGatePayload }).tier_gate;
          openTierGate({ kind: tg.kind, required_tier: tg.required_tier });
          return;
        }
        setError(r.error);
        return;
      }
      onClose();
    });
  };

  return createPortal(
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
        {isProspective && !active && (
          <div className="modal-hint" role="note">
            {prospectiveLoading
              ? 'Собираю промпт из текущих полей сцены…'
              : 'Это предварительный промпт. Отредактируй текст ниже — он отправится в генератор как есть.'}
          </div>
        )}
        <textarea
          ref={(el) => {
            if (el && document.activeElement !== el) el.focus();
          }}
          className="prompt-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          spellCheck={false}
          placeholder={prospectiveLoading ? '' : 'Промпт будет здесь…'}
        />
        <div className="modal-meta">
          <span>{wordCount} слов</span>
          <span className="dot">·</span>
          <span>модель: {active?.model ?? prospectiveModel ?? '—'}</span>
          {active ? (
            <>
              <span className="dot">·</span>
              <span>версия от {new Date(active.generated_at).toLocaleString('ru-RU')}</span>
            </>
          ) : (
            isProspective &&
            !prospectiveLoading && (
              <>
                <span className="dot">·</span>
                <span className="prospective-tag">черновик</span>
              </>
            )
          )}
        </div>
        {error && <div className="modal-error">⚠ {error}</div>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className={`btn primary regen-cta${pending ? ' busy' : ''}`}
            onClick={handleApply}
            disabled={pending || text.trim().length === 0}
            aria-busy={pending}
          >
            {pending ? (
              <>
                <span className="spinner inline-spinner" /> Запускаю…
              </>
            ) : (
              <>
                ▶ Применить и сгенерировать{' '}
                <span className="cta-cost">~$0.{kind === 'video' ? '20' : '02'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
