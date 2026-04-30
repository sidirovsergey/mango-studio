'use client';

import { setProjectTierAction } from '@/server/actions/setProjectTierAction';
import type { Tier } from '@mango/core';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

interface Props {
  projectId: string;
  tier: Tier;
}

export function TierToggle({ projectId, tier }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const switchTo = (next: Tier) => {
    if (next === tier || isPending) return;
    startTransition(async () => {
      await setProjectTierAction({ project_id: projectId, tier: next });
      router.refresh();
    });
  };

  return (
    <div className="tier-toggle" data-tier={tier}>
      <button
        type="button"
        className={tier === 'economy' ? 'active' : ''}
        onClick={() => switchTo('economy')}
        disabled={isPending}
      >
        Эконом
      </button>
      <button
        type="button"
        className={tier === 'premium' ? 'active' : ''}
        onClick={() => switchTo('premium')}
        disabled={isPending}
      >
        Премиум
      </button>
    </div>
  );
}
