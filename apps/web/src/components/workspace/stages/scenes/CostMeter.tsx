'use client';

import { getProjectCostAction } from '@/server/actions/getProjectCostAction';
import type { Database } from '@mango/db';
import { useEffect, useRef, useState } from 'react';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

interface Props {
  projectId: string;
  /**
   * Pass the same `jobs` array the parent uses for polling. We only react
   * to its `.length` and to the count of completed entries — both signals
   * for "something finished, re-fetch the sum".
   */
  jobs: MediaJobRow[];
}

export function CostMeter({ projectId, jobs }: Props) {
  const [cost, setCost] = useState<number | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const prevCost = useRef<number | null>(null);

  const completedCount = jobs.filter((j) => j.status === 'completed').length;

  // biome-ignore lint/correctness/useExhaustiveDependencies: change triggers
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getProjectCostAction({ project_id: projectId });
      if (cancelled || !r.ok) return;
      const next = r.cost_usd;
      if (prevCost.current !== null && next > prevCost.current) {
        setPulsing(true);
        setTimeout(() => setPulsing(false), 900);
      }
      prevCost.current = next;
      setCost(next);
    })();
    return () => {
      cancelled = true;
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
