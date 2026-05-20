'use client';

import { useTransition } from 'react';
import { openProStudioAction, requestRenderAction } from '../actions/intent-actions';

/**
 * Phase 1.8.1 / 1.8.3 — sticky CTA bar at the bottom of /p/[publicSlug].
 *
 * Two buttons per CJM spec §3 экран 3:
 *
 *   [Получить готовый ролик — XXX ₽]  [Открыть в Pro-Студии]
 *
 * Authed flow: each button calls the corresponding server action which
 * routes through createTopupAction → createTopupForAuthedUser. On success
 * the action returns a ЮKassa confirmation_url; we redirect the browser
 * there via window.location.replace. After payment, ЮKassa returns to
 * /p/[slug]?nonce=X and the 1.7.1 intent resolution flow takes over.
 *
 * Anon flow (Phase 1.8.3): the server action now arms the pending-intent
 * cookie and returns a typed `{ok:false, error:{code:'auth_required'}}`
 * result. The client navigates to /login; verifyOtpAction reads the
 * cookie after OTP verify and replays the intent directly, returning a
 * `next_url` that the LoginForm uses to land the user on ЮKassa without
 * a landing-page roundtrip.
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

  /**
   * Phase 1.8.3 Sub-phase D: when the server action reports
   * `auth_required`, the intent cookie has already been armed server-side
   * — we just navigate to /login. verifyOtpAction picks up the cookie
   * after OTP verify and lands the user straight on ЮKassa via next_url.
   * Other errors fall back to the legacy alert.
   */
  function handleResult(result: Awaited<ReturnType<typeof requestRenderAction>>) {
    if (result.ok && 'confirmation_url' in result) {
      window.location.replace(result.confirmation_url);
      return;
    }
    if (!result.ok && result.error.code === 'auth_required') {
      window.location.href = '/login';
      return;
    }
    if (!result.ok) {
      // Richer error UX (modals) deferred to a follow-up; an alert
      // surfaces the human-readable message for now.
      alert(result.error.message);
    }
  }

  function onRender() {
    startRender(async () => {
      const result = await requestRenderAction({ projectId, publicSlug });
      handleResult(result);
    });
  }

  function onStudio() {
    startStudio(async () => {
      const result = await openProStudioAction({ projectId, publicSlug });
      handleResult(result);
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
