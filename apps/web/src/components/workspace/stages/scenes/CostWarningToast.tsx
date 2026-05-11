'use client';

import { getProjectCostAction } from '@/server/actions/getProjectCostAction';
import type { Database } from '@mango/db';
import { useEffect, useState } from 'react';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

interface Props {
  projectId: string;
  jobs: MediaJobRow[];
}

const THRESHOLD_USD = Number(process.env.NEXT_PUBLIC_COST_WARN_THRESHOLD_USD ?? '10');

export function CostWarningToast({ projectId, jobs }: Props) {
  const [show, setShow] = useState(false);
  const [cost, setCost] = useState(0);
  const completedCount = jobs.filter((j) => j.status === 'completed').length;

  // biome-ignore lint/correctness/useExhaustiveDependencies: change triggers
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getProjectCostAction({ project_id: projectId });
      if (cancelled || !r.ok) return;
      setCost(r.cost_usd);
      const ack =
        typeof window !== 'undefined' &&
        sessionStorage.getItem(`cost-warn-ack:${projectId}`) === '1';
      if (r.cost_usd >= THRESHOLD_USD && !ack) setShow(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, jobs.length, completedCount]);

  if (!show) return null;

  const handleAck = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`cost-warn-ack:${projectId}`, '1');
    }
    setShow(false);
  };

  const handleStop = () => {
    setShow(false);
  };

  return (
    <div className="cost-warning-toast" role="alert">
      <span>
        ⚠ Потрачено <strong>${cost.toFixed(2)}</strong> на этот проект.
      </span>
      <span>Продолжить генерацию?</span>
      <div className="toast-actions">
        <button type="button" className="btn primary" onClick={handleAck}>
          Да, продолжить
        </button>
        <button type="button" className="btn" onClick={handleStop}>
          Стоп
        </button>
      </div>
    </div>
  );
}
