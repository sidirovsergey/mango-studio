'use client';

import { useEffect, useState } from 'react';

/**
 * Phase 1.8.2 — generating-storyboard loading view. Polls /api/project-status
 * with 3s → 5s → 10s backoff until status flips off generating_*; reloads
 * the page so the RSC renders the appropriate successor view.
 *
 * Phase 1.8.x design pass: editorial loading with five animated phase pills.
 */

const HARD_TIMEOUT_MS = 6 * 60 * 1000;

function intervalFor(elapsedMs: number): number {
  if (elapsedMs < 60_000) return 3_000;
  if (elapsedMs < 180_000) return 5_000;
  return 10_000;
}

const PHASES = [
  { glyph: '✦', label: 'Анализирую идею' },
  { glyph: '☉', label: 'Создаю персонажей' },
  { glyph: '✂', label: 'Раскладываю на сцены' },
  { glyph: '◐', label: 'Генерирую первые кадры' },
  { glyph: '✎', label: 'Пишу сценарий и диалоги' },
];

export function LoadingView({ publicSlug, title }: { publicSlug: string; title: string | null }) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [activePhase, setActivePhase] = useState(0);

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
          };
          if (body.ok && body.is_generating === false) {
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

    // Cycle the visual "active phase" pill every ~14 seconds so the user has
    // a sense of progress even though we don't have real phase telemetry.
    const phaseId = setInterval(() => {
      if (alive) setActivePhase((p) => Math.min(p + 1, PHASES.length - 1));
    }, 14_000);

    schedule();

    return () => {
      alive = false;
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
      clearInterval(tickerId);
      clearInterval(phaseId);
    };
  }, [publicSlug]);

  if (stalled) {
    return (
      <main className="loading-stalled">
        <div className="loading-stalled-inner">
          <h1>Что-то задерживается</h1>
          <p>
            Раскадровка генерируется дольше обычного. Откройте ссылку чуть позже — генерация
            продолжается в фоне.
          </p>
          <p>
            <a href={`/p/${publicSlug}`}>Перезагрузить страницу</a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="loading-view">
      <div className="loading-view-inner">
        <p className="loading-view-eyebrow">Mango Studio · готовим раскадровку</p>
        <h1 className="loading-view-title">{title ?? 'Подбираем сценарий и кадры'}</h1>
        <p className="loading-view-subtitle">
          Раскадровка собирается прямо сейчас. Обычно это занимает 30–90 секунд. Можно закрыть
          вкладку — мы сохраним результат по этой ссылке.
        </p>

        {/* Codex 2026-05-19: the phase pills rotate every 14s without
         * real progress telemetry — announcing each rotation as a live
         * region would be misleading to screen-reader users. Hide the
         * decorative list from a11y; expose ONE polite status line
         * (`loading-tick`) reflecting actual elapsed time. */}
        <ul className="loading-phases" aria-hidden="true">
          {PHASES.map((phase, idx) => (
            <li key={phase.label} className={`phase ${idx <= activePhase ? 'active' : ''}`}>
              <span className="glyph" aria-hidden="true">
                {phase.glyph}
              </span>
              {phase.label}
              {idx <= activePhase ? '…' : ''}
            </li>
          ))}
        </ul>

        <p className="loading-tick" role="status" aria-live="polite">
          Готовим раскадровку · {elapsedSec}s
        </p>
      </div>
    </main>
  );
}
