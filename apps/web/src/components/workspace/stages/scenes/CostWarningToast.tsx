'use client';

import { getProjectCostAction } from '@/server/actions/getProjectCostAction';
import { useEffect, useState } from 'react';
import { useStage04 } from './Stage04Provider';

interface Props {
  projectId: string;
}

const THRESHOLD_USD = Number(process.env.NEXT_PUBLIC_COST_WARN_THRESHOLD_USD ?? '10');

export function CostWarningToast({ projectId }: Props) {
  const { jobs } = useStage04();
  const [show, setShow] = useState(false);
  const [cost, setCost] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: jobs.length is the change trigger
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
  }, [projectId, jobs.length]);

  if (!show) return null;

  const handleAck = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`cost-warn-ack:${projectId}`, '1');
    }
    setShow(false);
  };

  const handleStop = () => {
    // Soft warning only — closing without ack so the next submit may re-trigger.
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
