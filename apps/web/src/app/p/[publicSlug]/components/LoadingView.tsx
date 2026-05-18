'use client';

import { useEffect, useState } from 'react';

/**
 * Phase 1.8.2 — generating-storyboard loading view.
 *
 * Polls `/api/project-status?slug=` every 3 s (with linear→5 s→10 s backoff
 * after 1 min) until status flips off `generating_storyboard`. On flip,
 * reloads the page so the RSC re-fetches and renders the appropriate
 * follow-up view (StoryboardView for share-ready, ErrorView for error).
 *
 * Why poll vs Supabase Realtime: 1.8.2 ships pull-based for simplicity;
 * Realtime subscription on `projects` requires a public RLS policy that
 * leaks status to anyone with the slug. Polling via server-side
 * fn_inspect_intent-style RPC was considered; we use a plain GET endpoint
 * here since project status (without script content) is already meant to
 * be publicly visible at this URL.
 *
 * 5-phase progress (per CJM §3 экран 2): MVP shows a generic
 * indeterminate animation. Granular per-phase indicators (analysing /
 * characters / scenes / first frames / dialogue) deferred to a future
 * polish — they require `projects.progress jsonb` infra that is not in
 * 1.8.2 scope.
 */

const HARD_TIMEOUT_MS = 6 * 60 * 1000; // 6 min — generation usually <90s; 6 min is safety net.

function intervalFor(elapsedMs: number): number {
  if (elapsedMs < 60_000) return 3_000;
  if (elapsedMs < 180_000) return 5_000;
  return 10_000;
}

export function LoadingView({ publicSlug, title }: { publicSlug: string; title: string | null }) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const startMs = Date.now();
    let alive = true;
    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;

    function schedule() {
      if (!alive) return;
      const elapsed = Date.now() - startMs;
      if (elapsed >= HARD_TIMEOUT_MS) {
        setStalled(true);
        return;
      }
      pollTimeoutId = setTimeout(poll, intervalFor(elapsed));
    }

    async function poll() {
      if (!alive) return;
      if (document.hidden) {
        schedule();
        return;
      }
      try {
        const res = await fetch(`/api/project-status?slug=${encodeURIComponent(publicSlug)}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const body = (await res.json()) as {
            ok: boolean;
            status?: string;
            is_generating?: boolean;
            is_share_ready?: boolean;
          };
          if (body.ok && body.is_generating === false) {
            // Status flipped off generating — reload so RSC renders the
            // correct successor view (storyboard / error / etc).
            window.location.reload();
            return;
          }
        }
      } catch {
        // Network blip — keep polling.
      }
      schedule();
    }

    const tickerId = setInterval(() => {
      if (alive) setElapsedSec(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);

    schedule();

    return () => {
      alive = false;
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
      clearInterval(tickerId);
    };
  }, [publicSlug]);

  if (stalled) {
    return (
      <main className="loading-stalled" style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
        <h1>Что-то задерживается</h1>
        <p>
          Раскадровка генерируется дольше обычного. Откройте ссылку чуть позже — генерация
          продолжается в фоне.
        </p>
        <p>
          <a href={`/p/${publicSlug}`}>Перезагрузить страницу</a>
        </p>
      </main>
    );
  }

  return (
    <main className="loading-view" style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>{title ?? 'Готовим раскадровку'}</h1>
        <p style={{ marginTop: 8, opacity: 0.7 }}>
          Mango пишет сценарий и генерирует первые кадры. Это занимает 30–90 секунд.
        </p>
      </header>

      <ul className="loading-phases" aria-live="polite">
        <li className="phase active">🪄 Анализирую идею…</li>
        <li className="phase active">🎭 Создаю персонажей…</li>
        <li className="phase active">🎬 Раскладываю на сцены…</li>
        <li className="phase active">🖼️ Генерирую первые кадры…</li>
        <li className="phase active">✍️ Пишу сценарий и диалоги…</li>
      </ul>

      <p style={{ marginTop: 24, fontSize: 12, opacity: 0.5 }}>
        Прошло: {elapsedSec}s. Можно закрыть вкладку — генерация продолжается в фоне, мы сохраним
        результат по этой ссылке.
      </p>
    </main>
  );
}
