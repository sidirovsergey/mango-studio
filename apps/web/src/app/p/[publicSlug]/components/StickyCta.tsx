'use client';

import { useTransition } from 'react';
import { openProStudioAction, requestRenderAction } from '../actions/intent-actions';

/**
 * Phase 1.8.1 — sticky CTA bar at the bottom of /p/[publicSlug].
 *
 * Two buttons per CJM spec §3 экран 3:
 *
 *   [Получить готовый ролик — XXX ₽]  [Открыть в Pro-Студии]
 *
 * Each button wraps the corresponding server action which itself calls
 * createTopupAction with intent {kind, project_id, return_to}. On success,
 * the action returns a ЮKassa confirmation_url; we redirect the browser
 * there via window.location.replace. After payment, ЮKassa redirects back
 * to /p/[slug]?nonce=X and the 1.7.1 intent resolution flow takes over.
 *
 * Anon callers: createTopupAction internally calls redirect('/login') which
 * Next.js translates to a server-side 307 — the form action completes, the
 * browser navigates. We catch the standard Next redirect from `useTransition`
 * via the action's typed result.
 */
export function StickyCta({
  projectId,
  publicSlug,
  renderPriceKopeks,
  renderModifiers,
}: {
  projectId: string;
  publicSlug: string;
  renderPriceKopeks: number;
  renderModifiers: Array<{ name: string; kopeks: number }>;
}) {
  const [renderPending, startRender] = useTransition();
  const [studioPending, startStudio] = useTransition();

  const priceRub = Math.round(renderPriceKopeks / 100);

  function onRender() {
    startRender(async () => {
      const result = await requestRenderAction({ projectId, publicSlug });
      if (result.ok && 'confirmation_url' in result) {
        window.location.replace(result.confirmation_url);
      } else if (!result.ok) {
        // Surface a basic alert; richer error UX (modals) deferred to 1.8.3.
        alert(result.error.message);
      }
    });
  }

  function onStudio() {
    startStudio(async () => {
      const result = await openProStudioAction({ projectId, publicSlug });
      if (result.ok && 'confirmation_url' in result) {
        window.location.replace(result.confirmation_url);
      } else if (!result.ok) {
        alert(result.error.message);
      }
    });
  }

  return (
    <div className="sticky-cta-bar" role="region" aria-label="Действия с раскадровкой">
      <div className="sticky-cta-info">
        <span className="sticky-cta-info-line">Сценарий и первые кадры — бесплатно.</span>
        <span className="sticky-cta-info-line dim">Готовый ролик собирается из ваших сцен.</span>
      </div>
      <div className="sticky-cta-buttons">
        <button
          type="button"
          className="sticky-cta-primary"
          onClick={onRender}
          disabled={renderPending || studioPending}
          aria-busy={renderPending}
        >
          {renderPending ? 'Открываем оплату…' : `Собрать ролик · ${priceRub} ₽`}
        </button>
        <button
          type="button"
          className="sticky-cta-secondary"
          onClick={onStudio}
          disabled={renderPending || studioPending}
          aria-busy={studioPending}
        >
          {studioPending ? 'Открываем…' : 'В Pro-Студию'}
        </button>
      </div>
      {renderModifiers.length > 1 && (
        <details className="sticky-cta-breakdown">
          <summary>Как складывается цена</summary>
          <ul>
            {renderModifiers.map((m) => (
              <li key={m.name}>
                <span>{m.name}</span>
                <span>{Math.round(m.kopeks / 100)} ₽</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
