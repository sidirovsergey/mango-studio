'use client';

import { useState, useTransition } from 'react';

/**
 * Client-side form for /mock-checkout. POSTs payment_id to /api/mock-confirm,
 * then redirects to the returnUrl on success (this is `/p/{slug}?nonce=…`
 * — the same URL ЮKassa would have redirected to after real payment).
 *
 * The card-number/expiry/cvc inputs are purely cosmetic (no validation, no
 * submission) — they make the page look like a real bank gateway during
 * the acquirer review screencast. Only the «Оплатить» button does anything.
 */
export function MockCheckoutForm({
  paymentId,
  returnUrl,
  amountRub,
}: {
  paymentId: string;
  returnUrl: string;
  amountRub: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/mock-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_id: paymentId }),
        });
        const body = (await res.json()) as
          | { ok: true; redirect: string }
          | { ok: false; error: string };
        if (!res.ok || !body.ok) {
          setError(
            !body.ok && body.error
              ? body.error
              : `Не удалось подтвердить платёж (HTTP ${res.status}).`,
          );
          return;
        }
        // Use the return URL we built into the mock payment object — same
        // location ЮKassa would have redirected to after real payment.
        window.location.replace(body.redirect || returnUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Сетевая ошибка');
      }
    });
  }

  return (
    <form onSubmit={handlePay} className="mock-checkout-form">
      <label className="mock-checkout-field">
        <span>Номер карты</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="4242 4242 4242 4242"
          defaultValue="4242 4242 4242 4242"
          autoComplete="off"
        />
      </label>
      <div className="mock-checkout-row">
        <label className="mock-checkout-field mock-checkout-field-half">
          <span>Срок</span>
          <input type="text" placeholder="12/30" defaultValue="12/30" autoComplete="off" />
        </label>
        <label className="mock-checkout-field mock-checkout-field-half">
          <span>CVC</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="123"
            defaultValue="123"
            autoComplete="off"
          />
        </label>
      </div>

      <button type="submit" className="mock-checkout-pay" disabled={pending} aria-busy={pending}>
        {pending ? 'Подтверждаем оплату…' : `Оплатить ${amountRub} ₽`}
      </button>

      {error && (
        <p className="mock-checkout-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
