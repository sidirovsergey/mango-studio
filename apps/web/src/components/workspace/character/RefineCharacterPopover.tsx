'use client';

import { generateCharacterDossierAction } from '@/server/actions/generateCharacterDossierAction';
import { refineCharacterAction } from '@/server/actions/refineCharacterAction';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

interface Props {
  projectId: string;
  characterId: string;
  onClose(): void;
}

type Step = 'input' | 'confirm-regen' | 'regenerating';

export function RefineCharacterPopover({ projectId, characterId, onClose }: Props) {
  const [text, setText] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

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

  const applyRefine = () => {
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const r = await refineCharacterAction({
        project_id: projectId,
        character_id: characterId,
        instruction: text,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      setStep('confirm-regen');
    });
  };

  const skipRegen = () => {
    onClose();
  };

  const doRegen = () => {
    setError(null);
    setStep('regenerating');
    startTransition(async () => {
      const r = await generateCharacterDossierAction({
        project_id: projectId,
        character_id: characterId,
      });
      if (!r.ok) {
        setError(r.error);
        setStep('confirm-regen');
        return;
      }
      router.refresh();
      onClose();
    });
  };

  if (step === 'input') {
    return (
      <div className="refine-popover" ref={ref}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="например: сделай очки круглыми вместо квадратных"
          rows={3}
        />
        {error && (
          <div className="char-modal-error" style={{ marginTop: 8 }}>
            ⚠ {error}
          </div>
        )}
        <div className="popover-actions">
          <button type="button" onClick={onClose} disabled={isPending}>
            Отмена
          </button>
          <button
            type="button"
            onClick={applyRefine}
            disabled={isPending || !text.trim()}
            className="primary"
          >
            {isPending ? 'Применяю...' : 'Применить'}
          </button>
        </div>
      </div>
    );
  }

  // confirm-regen or regenerating
  const regenLabel = step === 'regenerating' ? 'Генерирую...' : 'Перегенерировать';
  return (
    <div className="refine-popover" ref={ref}>
      <div className="popover-text">
        Изменения сохранены. Перегенерировать досье с учётом новых правок? Это займёт ~30 секунд и
        будет тарифицировано.
      </div>
      {error && (
        <div className="char-modal-error" style={{ marginTop: 8 }}>
          ⚠ {error}
        </div>
      )}
      <div className="popover-actions">
        <button type="button" onClick={skipRegen} disabled={isPending}>
          Не сейчас
        </button>
        <button type="button" onClick={doRegen} disabled={isPending} className="primary">
          {regenLabel}
        </button>
      </div>
    </div>
  );
}
