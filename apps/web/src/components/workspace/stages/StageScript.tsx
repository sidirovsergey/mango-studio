'use client';

import { ThinkingShimmer } from '@/components/effects/ThinkingShimmer';
import {
  generateScriptAction,
  refineBeatAction,
  refineScriptAction,
  regenScriptAction,
} from '@/server/actions/scripts';
import type { LLMProviderError, ScriptGenOutput } from '@mango/core';
import type { Database } from '@mango/db/types';
import { useEffect, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { StageHead } from '../shared/StageHead';

type ProjectRow = Database['public']['Tables']['projects']['Row'];

interface Props {
  project: ProjectRow;
  script: ScriptGenOutput | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  rate_limit: 'Mango перегрузилась — подожди минуту и попробуй снова.',
  context_length: 'Запрос получился слишком большим. Сократи идею.',
  safety_filter: 'Сработал safety-фильтр модели. Попробуй сформулировать иначе.',
  timeout: 'Mango не успела придумать. Попробуй ещё раз.',
  invalid_json: 'Mango выдала не-JSON. Попробуй ещё раз.',
  unknown: 'Что-то пошло не так. Попробуй ещё раз.',
};

export function StageScript({ project, script }: Props) {
  const [currentScript, setCurrentScript] = useState<ScriptGenOutput | null>(script);
  const [isPending, startTransition] = useTransition();
  const [refineFormOpen, setRefineFormOpen] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [activeBeatId, setActiveBeatId] = useState<string | null>(null);
  const [activeBeatInstruction, setActiveBeatInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Chat tools (refine_script / regen_script / refine_beat) mutate the script
  // server-side and trigger router.refresh(). When the parent receives a new
  // script prop, sync it into local state so the beats list reflects the
  // actual content.
  useEffect(() => {
    setCurrentScript(script);
  }, [script]);

  const handleError = (err: unknown) => {
    const code = (err as LLMProviderError)?.code ?? 'unknown';
    setError(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.unknown!);
  };

  const handleGenerate = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateScriptAction({ project_id: project.id });
        setCurrentScript(result);
      } catch (err) {
        handleError(err);
      }
    });
  };

  const handleRegen = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await regenScriptAction({ project_id: project.id });
        setCurrentScript(result);
      } catch (err) {
        handleError(err);
      }
    });
  };

  const handleRefineSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (refineInstruction.trim().length === 0) return;
    setError(null);
    const instruction = refineInstruction.trim();
    setRefineFormOpen(false);
    setRefineInstruction('');
    startTransition(async () => {
      try {
        const result = await refineScriptAction({ project_id: project.id, instruction });
        setCurrentScript(result);
      } catch (err) {
        handleError(err);
      }
    });
  };

  const handleBeatRefineSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!activeBeatId || activeBeatInstruction.trim().length === 0) return;
    setError(null);
    const sceneId = activeBeatId;
    const instruction = activeBeatInstruction.trim();
    setActiveBeatId(null);
    setActiveBeatInstruction('');
    startTransition(async () => {
      try {
        const result = await refineBeatAction({
          project_id: project.id,
          scene_id: sceneId,
          instruction,
        });
        if (currentScript) {
          setCurrentScript({
            ...currentScript,
            scenes: currentScript.scenes.map((s) =>
              s.scene_id === sceneId ? { ...s, description: result.updated_description } : s,
            ),
          });
        }
      } catch (err) {
        handleError(err);
      }
    });
  };

  if (!currentScript && !isPending) {
    return (
      <section className="stage" data-stage id="scriptStage">
        <StageHead num="03" title="Сценарий" />
        <div
          className="stage-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}
        >
          <p style={{ color: 'var(--ink-400)' }}>
            Mango готова собрать сценарий из твоей идеи в 5 битах.
          </p>
          <button type="button" className="cta" onClick={handleGenerate} disabled={isPending}>
            Создать сценарий
          </button>
          {error && (
            <div className="stage-error" role="alert" style={{ color: 'var(--err-500, #c0392b)' }}>
              {error}
            </div>
          )}
        </div>
      </section>
    );
  }

  if (isPending && !currentScript) {
    return (
      <section className="stage" data-stage id="scriptStage">
        <StageHead num="03" title="Сценарий" />
        <ThinkingShimmer active />
      </section>
    );
  }

  return (
    <section className="stage" data-stage id="scriptStage">
      <div className="stage-head">
        <span className="stage-num">03</span>
        <div className="stage-title">Сценарий</div>
        <span className="section-tag">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: 'var(--leaf-500)',
              boxShadow: '0 0 0 3px rgba(31,179,100,0.18)',
            }}
          />
          Готов
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="icon-btn"
          id="scriptRegen"
          title="Перегенерировать сценарий"
          onClick={handleRegen}
          disabled={isPending}
        >
          <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" />
          </svg>
        </button>
        <button
          type="button"
          className="icon-btn"
          id="scriptRefine"
          title="Уточнить промптом"
          onClick={() => setRefineFormOpen((v) => !v)}
          disabled={isPending}
        >
          <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20l4-4M3 21l3-9 9-9 6 6-9 9-9 3z" />
          </svg>
        </button>
      </div>

      {currentScript && (
        <div className="stage-body-relative">
          {isPending && (
            <div className="thinking-overlay">
              <ThinkingShimmer active />
            </div>
          )}
          <div className="script-summary" id="scriptSummary">
            {currentScript.title}
          </div>
          <div className="beats-list" id="beatsList">
            {currentScript.scenes.map((scene, idx) => (
              <button
                key={scene.scene_id}
                type="button"
                className="beat"
                data-beat={idx + 1}
                onClick={() => setActiveBeatId(scene.scene_id)}
                style={{
                  animation: 'fadeInUp 0.4s ease-out both',
                  animationDelay: `${idx * 0.08}s`,
                }}
              >
                <span className="beat-num">{String(idx + 1).padStart(2, '0')}</span>
                <span className="beat-duration">{scene.duration_sec} сек</span>
                <span className="beat-arrow">→</span>
                <span className="beat-text" data-beat-text>
                  {scene.description}
                </span>
                <svg className="i beat-act" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 21l3-9 9-9 6 6-9 9-9 3z" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {refineFormOpen && (
        <form className="refine-form" style={{ marginTop: 12 }} onSubmit={handleRefineSubmit}>
          <textarea
            placeholder="Например: «сделай развязку грустнее» или «добавь второго краба-конкурента»"
            value={refineInstruction}
            onChange={(e) => setRefineInstruction(e.target.value)}
            // biome-ignore lint/a11y/noAutofocus: refine form opens on explicit user action; autofocus is desired UX
            autoFocus
            disabled={isPending}
          />
          <div className="actions">
            <button type="button" className="cancel" onClick={() => setRefineFormOpen(false)}>
              Отмена
            </button>
            <button type="submit" className="apply" disabled={isPending}>
              Применить
            </button>
          </div>
        </form>
      )}

      {activeBeatId && (
        <form className="refine-form" style={{ marginTop: 12 }} onSubmit={handleBeatRefineSubmit}>
          <textarea
            placeholder={`Уточни бит «${currentScript?.scenes.find((s) => s.scene_id === activeBeatId)?.description ?? ''}»`}
            value={activeBeatInstruction}
            onChange={(e) => setActiveBeatInstruction(e.target.value)}
            // biome-ignore lint/a11y/noAutofocus: refine form opens on explicit user action; autofocus is desired UX
            autoFocus
            disabled={isPending}
          />
          <div className="actions">
            <button type="button" className="cancel" onClick={() => setActiveBeatId(null)}>
              Отмена
            </button>
            <button type="submit" className="apply" disabled={isPending}>
              Применить
            </button>
          </div>
        </form>
      )}

      {error && (
        <div
          className="stage-error"
          role="alert"
          style={{ color: 'var(--err-500, #c0392b)', marginTop: 12 }}
        >
          {error}
        </div>
      )}
    </section>
  );
}
