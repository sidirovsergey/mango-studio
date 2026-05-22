/**
 * Phase 1.7.1 — intent expired view.
 *
 * Intent TTL is 1 hour. If the user pays but the webhook lags past expiry
 * AND no later webhook delivery flips the intent to paid (fn_settle_paid_intent
 * accepts pending|expired so this is rare), we land here. Balance is still
 * credited; the user can manually trigger render from the project page.
 */
export function IntentExpiredView(props: { projectId: string }) {
  return (
    <main style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <h1>Намерение оплаты истекло</h1>
      <p>
        С момента создания заказа прошло больше часа. Баланс уже зачислен — вы можете запустить
        рендер вручную из проекта.
      </p>
      <p style={{ marginTop: 24 }}>
        <a href={`/projects/${props.projectId}`}>Открыть проект в Студии</a>
      </p>
    </main>
  );
}
