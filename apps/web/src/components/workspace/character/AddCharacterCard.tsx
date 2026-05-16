'use client';

import { createCharacterAction } from '@/server/actions/createCharacterAction';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface Props {
  projectId: string;
}

export function AddCharacterCard({ projectId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const add = () => {
    setError(null);
    startTransition(async () => {
      try {
        const r = await createCharacterAction({ project_id: projectId, name: 'Новый персонаж' });
        if (r.ok) {
          router.refresh();
          router.push(`?char=${r.character_id}`, { scroll: false });
          return;
        }
        setError(r.error ?? 'Не удалось добавить персонажа');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось добавить персонажа');
      }
    });
  };

  return (
    <div className="char-add-wrap">
      <button type="button" className="char-add" onClick={add} disabled={isPending}>
        <div className="plus">+</div>
        <div>{isPending ? 'Добавляю...' : 'Добавить персонажа'}</div>
      </button>
      {error && (
        <div className="char-add-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
