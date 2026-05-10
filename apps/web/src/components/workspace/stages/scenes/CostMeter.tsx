'use client';

import { getProjectCostAction } from '@/server/actions/getProjectCostAction';
import { useEffect, useState } from 'react';
import { useStage04 } from './Stage04Provider';

interface Props {
  projectId: string;
}

export function CostMeter({ projectId }: Props) {
  const { jobs } = useStage04();
  const [cost, setCost] = useState<number | null>(null);

  // Re-fetch when jobs list changes (Realtime push or completion).
  // Tracking jobs.length is enough because completed/failed jobs replace pending.
  // biome-ignore lint/correctness/useExhaustiveDependencies: jobs.length is the change trigger
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getProjectCostAction({ project_id: projectId });
      if (!cancelled && r.ok) setCost(r.cost_usd);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, jobs.length]);

  if (cost === null) return <span className="cost-meter">💰 …</span>;
  return <span className="cost-meter">💰 ${cost.toFixed(2)}</span>;
}
