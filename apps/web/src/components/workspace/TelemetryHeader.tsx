'use client';

import { scrollToFinal } from '@/lib/scroll-to-final';
import '@/styles/telemetry-header.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useScriptState } from './ScriptStateProvider';
import { derivePipelinePhase } from './derivePipelinePhase';

const JUST_FINISHED_WINDOW_MS = 6_000;

export function TelemetryHeader() {
  const { script, jobs } = useScriptState();
  const masterActiveId = script?.master_clip_active_version_id ?? null;
  const phase = useMemo(
    () => derivePipelinePhase(script?.scenes ?? [], jobs, masterActiveId),
    [script, jobs, masterActiveId],
  );

  const [justFinished, setJustFinished] = useState(false);
  const prevPhaseRef = useRef(phase.kind);
  const masterIdAtFinalizeStartRef = useRef<string | null>(masterActiveId);

  useEffect(() => {
    if (prevPhaseRef.current !== 'finalizing' && phase.kind === 'finalizing') {
      masterIdAtFinalizeStartRef.current = masterActiveId;
    }
    if (
      prevPhaseRef.current === 'finalizing' &&
      phase.kind === 'idle' &&
      masterActiveId &&
      masterActiveId !== masterIdAtFinalizeStartRef.current
    ) {
      setJustFinished(true);
      const t = setTimeout(() => setJustFinished(false), JUST_FINISHED_WINDOW_MS);
      prevPhaseRef.current = phase.kind;
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = phase.kind;
  }, [phase.kind, masterActiveId]);

  if (phase.kind === 'idle' && !justFinished) return null;

  if (justFinished) {
    return (
      <div className="telemetry-header telemetry-just-finished" role="status" aria-live="polite">
        <span className="telemetry-num done">✓ готово</span>
        <div className="telemetry-prog telemetry-prog-done" aria-hidden />
        <span className="telemetry-status">финальный ролик собран</span>
        <button
          type="button"
          className="telemetry-show-link"
          onClick={() => {
            scrollToFinal();
            setJustFinished(false);
          }}
          aria-label="Перейти к финальному ролику"
        >
          показать
        </button>
      </div>
    );
  }

  if (phase.kind === 'rendering') {
    return (
      <div className="telemetry-header" role="status" aria-live="polite">
        <span className="telemetry-num">
          {phase.doneCount} / {phase.totalCount} готово
        </span>
        <div className="telemetry-prog telemetry-prog-flow" aria-hidden />
        <span className="telemetry-status">продолжаю работу</span>
        <SceneDots statuses={phase.sceneStatuses} />
      </div>
    );
  }

  if (phase.kind !== 'finalizing') return null;

  return (
    <div className="telemetry-header telemetry-finalizing" role="status" aria-live="polite">
      <span className="telemetry-num done">
        {phase.totalCount} / {phase.totalCount} ✓
      </span>
      <div className="telemetry-prog telemetry-prog-flow-fast" aria-hidden />
      <span className="telemetry-status">склеиваю финальный ролик</span>
      <SceneDots statuses={phase.sceneStatuses} />
      <span className="telemetry-finalize-icon" aria-hidden>
        ✦
      </span>
    </div>
  );
}

function SceneDots({ statuses }: { statuses: Array<'done' | 'running' | 'queued' | 'error'> }) {
  return (
    <div className="telemetry-dots" aria-hidden>
      {statuses.map((s, i) => (
        <div key={`dot-${i}-${s}`} className={`telemetry-dot telemetry-dot-${s}`} />
      ))}
    </div>
  );
}
