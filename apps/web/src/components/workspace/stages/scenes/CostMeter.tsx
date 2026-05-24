'use client';

import { type MediaJobUiRow } from '@/components/workspace/ScriptStateProvider';
import { getProjectCostAction } from '@/server/actions/getProjectCostAction';
import { useEffect, useRef, useState } from 'react';

interface Props {
  projectId: string;
  /**
   * Pass the same `jobs` array the parent uses for polling. We only react
   * to its `.length` and to the count of completed entries — both signals
   * for "something finished, re-fetch the sum".
   */
  jobs: MediaJobUiRow[];
}

export function CostMeter({ projectId, jobs }: Props) {
  const [cost, setCost] = useState<number | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const prevCost = useRef<number | null>(null);
  const requestSeq = useRef(0);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const completedCount = jobs.filter((j) => j.status === 'completed').length;

  // biome-ignore lint/correctness/useExhaustiveDependencies: change triggers
  useEffect(() => {
    let cancelled = false;
    const seq = ++requestSeq.current;
    (async () => {
      const r = await getProjectCostAction({ project_id: projectId });
      if (cancelled || seq !== requestSeq.current || !r.ok) return;
      const next = r.cost_usd;
      if (prevCost.current !== null && next > prevCost.current) {
        setPulsing(true);
        if (pulseTimer.current) clearTimeout(pulseTimer.current);
        pulseTimer.current = setTimeout(() => {
          if (seq === requestSeq.current) setPulsing(false);
          pulseTimer.current = null;
        }, 900);
      }
      prevCost.current = next;
      setCost(next);
    })();
    return () => {
      cancelled = true;
      if (pulseTimer.current) {
        clearTimeout(pulseTimer.current);
        pulseTimer.current = null;
      }
    };
  }, [projectId, jobs.length, completedCount]);

  if (cost === null) {
    return (
      <span className="cost-meter loading" title="Считаем затраты…">
        💰 <span className="cost-amount">…</span>
      </span>
    );
  }
  return (
    <span
      className={`cost-meter${pulsing ? ' pulsing' : ''}`}
      title="Сумма всех завершённых fal jobs по этому проекту (оценочно, если fal не вернул pricing)"
    >
      💰 <span className="cost-amount">${cost.toFixed(2)}</span>
    </span>
  );
}
