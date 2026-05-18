/**
 * Phase 1.7.1 — minimal pending-payment view.
 *
 * Polls every 3s for intent status change. When webhook flips the intent
 * to 'paid', a full page reload picks up the new state via the RSC. This
 * is intentionally simple for 1.7.1; Phase 1.8.1 will replace polling with
 * Supabase Realtime + smoother UI.
 */
'use client';

import { useEffect, useState } from 'react';

export function PaymentPendingView(props: { intentId: string; publicSlug: string }) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const tickerId = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    // Refresh the page every 3s — RSC re-fetches fn_inspect_intent and
    // re-renders the correct view if intent_status changed.
    const refreshId = setInterval(() => {
      window.location.reload();
    }, 3000);
    // Hard timeout — after 5 min surface a fallback.
    const timeoutId = setTimeout(
      () => {
        clearInterval(refreshId);
      },
      5 * 60 * 1000,
    );
    return () => {
      clearInterval(tickerId);
      clearInterval(refreshId);
      clearTimeout(timeoutId);
    };
  }, []);

  if (elapsedSec >= 5 * 60) {
    return (
      <main style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
        <h1>Что-то пошло не так</h1>
        <p>Платёж не подтвердился за 5 минут. Проверьте статус оплаты в профиле.</p>
        <p>
          <a href="/profile">Открыть профиль</a>
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <h1>Ожидаем подтверждение оплаты</h1>
      <p>ЮKassa подтверждает платёж. Это занимает 5–30 секунд.</p>
      <p style={{ fontSize: 12, opacity: 0.6 }}>
        Прошло: {elapsedSec}s • Слаг: {props.publicSlug}
      </p>
    </main>
  );
}
