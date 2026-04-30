'use client';

import { setCharacterModelAction } from '@/server/actions/setCharacterModelAction';
import { type Character, type Tier, getActiveModels } from '@mango/core';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';

interface Props {
  projectId: string;
  character: Character;
  tier?: Tier;
  onClose(): void;
}

export function ModelSelectorPopover({ projectId, character, tier = 'economy', onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const models = getActiveModels(tier);
  const current = character.config_overrides?.model ?? models[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  const select = (model: string) => {
    startTransition(async () => {
      await setCharacterModelAction({ project_id: projectId, character_id: character.id, model });
      router.refresh();
      onClose();
    });
  };

  return (
    <div className="model-popover" ref={ref}>
      <div className="popover-title">Модель ({tier})</div>
      <ul>
        {models.map((m) => (
          <li key={m}>
            <button
              type="button"
              onClick={() => select(m)}
              disabled={isPending}
              className={m === current ? 'selected' : ''}
            >
              {m === current && '✓ '}
              {m}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
