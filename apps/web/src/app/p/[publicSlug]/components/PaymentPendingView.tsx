/**
 * Phase 1.7.1 — pending-payment view with lightweight fetch poller.
 *
 * Codex audit E #2 fix: replaced full-page reload-every-3s with a fetch
 * poller to /api/intent-status?nonce=X. When intent_status transitions
 * to 'paid' (or terminal expired/canceled), we do a single
 * window.location.reload() so the RSC re-renders with the new state.
 *
 * Backoff: linear 3s for the first minute, then 5s, then 10s up to 5 min
 * total. Visibility pause: stop polling when tab is hidden, resume on focus.
 */
'use client';

import { useEffect, useState } from 'react';

const HARD_TIMEOUT_MS = 5 * 60 * 1000;

function intervalForElapsed(elapsedMs: number): number {
  if (elapsedMs < 60_000) return 3_000;
  if (elapsedMs < 180_000) return 5_000;
  return 10_000;
}

export function PaymentPendingView(props: { intentId: string; publicSlug: string }) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const nonce =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('nonce') : null;

  useEffect(() => {
    const startMs = Date.now();
    let alive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function schedule() {
      if (!alive) return;
      const elapsed = Date.now() - startMs;
      if (elapsed >= HARD_TIMEOUT_MS) return;
      timeoutId = setTimeout(poll, intervalForElapsed(elapsed));
    }

    async function poll() {
      if (!alive || !nonce) return;
      if (document.hidden) {
        schedule();
        return;
      }
      try {
        const res = await fetch(`/api/intent-status?nonce=${encodeURIComponent(nonce)}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const body = (await res.json()) as {
            ok: boolean;
            intent_status?: string;
            payment_status?: string;
          };
          // Transition off pending → reload page so RSC dispatches to the
          // correct view (paid → RenderProgressView, expired → ExpiredView, etc).
          if (body.ok && body.intent_status && body.intent_status !== 'pending') {
            window.location.reload();
            return;
          }
        }
      } catch {
        // Network blip — keep polling.
      }
      schedule();
    }

    // Ticker for UI display (1s).
    const tickerId = setInterval(() => {
      if (alive) setElapsedSec(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);

    schedule();

    return () => {
      alive = false;
      if (timeoutId) clearTimeout(timeoutId);
      clearInterval(tickerId);
    };
  }, [nonce]);

  if (elapsedSec >= HARD_TIMEOUT_MS / 1000) {
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
