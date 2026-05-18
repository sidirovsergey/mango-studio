'use client';

import { createTopupAction } from '@/app/upgrade/actions/createTopupAction';
import { useState, useTransition } from 'react';

interface TopupCardProps {
  code: 'topup_2000' | 'topup_5000' | 'topup_10000';
  rub: number;
  ecoCount: number;
  premiumCount: number;
}

export function TopupCard({ code, rub, ecoCount, premiumCount }: TopupCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTopupAction({ package_code: code });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      // Redirect into ЮKassa hosted page
      window.location.replace(result.confirmation_url);
    });
  }

  const rubLabel = rub.toLocaleString('ru-RU');

  return (
    <form className="topup-card" onSubmit={onSubmit} aria-labelledby={`topup-${code}-title`}>
      <div id={`topup-${code}-title`} className="topup-card-amount">
        {rubLabel} <span className="topup-card-currency">₽</span>
      </div>
      <ul className="topup-card-perks" aria-label="Что входит в пакет">
        <li>{ecoCount} эконом-сцен</li>
        <li>{premiumCount} премиум-сцен</li>
      </ul>
      <button
        type="submit"
        className="topup-card-button"
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? 'Открываем оплату…' : 'Купить'}
      </button>
      {error && (
        <div role="alert" className="topup-card-error">
          {error}
        </div>
      )}
    </form>
  );
}
