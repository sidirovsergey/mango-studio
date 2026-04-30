'use client';

import { createCharacterAction } from '@/server/actions/createCharacterAction';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

interface Props {
  projectId: string;
}

export function AddCharacterCard({ projectId }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const add = () => {
    startTransition(async () => {
      const r = await createCharacterAction({ project_id: projectId, name: 'Новый персонаж' });
      if (r.ok) {
        router.refresh();
        router.push(`?char=${r.character_id}`, { scroll: false });
      }
    });
  };

  return (
    <button type="button" className="char-add" onClick={add} disabled={isPending}>
      <div className="plus">+</div>
      <div>{isPending ? 'Добавляю...' : 'Добавить персонажа'}</div>
    </button>
  );
}
