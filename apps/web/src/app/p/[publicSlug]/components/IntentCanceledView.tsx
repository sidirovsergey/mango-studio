/**
 * Phase 1.7.1 — intent canceled view.
 *
 * Operator manually canceled the intent via SQL (e.g. response to refund
 * request before fund debit). User shouldn't normally see this — it's a
 * fallback for the audit/admin path.
 */
export function IntentCanceledView(props: { projectId: string }) {
  return (
    <main style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <h1>Заказ отменён</h1>
      <p>Эта оплата была отменена. Если это ошибка, напишите в поддержку.</p>
      <p style={{ marginTop: 24 }}>
        <a href={`/projects/${props.projectId}`}>Открыть проект в Студии</a>
      </p>
    </main>
  );
}
