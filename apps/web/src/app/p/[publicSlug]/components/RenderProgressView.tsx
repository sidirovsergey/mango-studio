/**
 * Phase 1.7.1 / 1.8.x — render-in-progress view.
 *
 * Shown when the user returns from ЮKassa (or mock checkout) and the
 * intent ledger flips to `paid` → `enqueueRenderForProject` runs.
 *
 * Two flavours:
 * - All scenes reserved cleanly → friendly «render running» state.
 * - Partial — some scenes couldn't reserve (e.g. first_frame still in
 *   flight from the bulk batch). We avoid showing internal error codes
 *   and steer the user into the Studio where they can manually retry
 *   the affected scenes when the first_frame catches up.
 */
export function RenderProgressView(props: {
  projectId: string;
  sceneJobIds: string[];
  masterJobId: string | undefined;
  partialError: {
    sceneErrors: Array<{ scene_id: string; error: string }>;
    masterError: string | undefined;
  } | null;
}) {
  const hasPartial = Boolean(props.partialError);
  const reservedCount = props.sceneJobIds.length;
  const failedCount = props.partialError?.sceneErrors.length ?? 0;
  const totalCount = reservedCount + failedCount;

  return (
    <main className="render-progress-page">
      <div className="render-progress-card">
        <p className="render-progress-eyebrow">Mango Studio</p>

        {!hasPartial ? (
          <>
            <h1 className="render-progress-title">Собираем ваш ролик</h1>
            <p className="render-progress-lead">
              {reservedCount > 0
                ? `Готовим ${reservedCount} ${pluralRu(reservedCount, 'сцена', 'сцены', 'сцен')} — это занимает 1–3 минуты.`
                : 'Готовим финальный клип — это занимает 1–3 минуты.'}{' '}
              Можно закрыть вкладку, вы получите готовый ролик по той же ссылке.
            </p>
            <div className="render-progress-actions">
              <a className="render-progress-cta" href={`/projects/${props.projectId}`}>
                Открыть в Студии
              </a>
            </div>
          </>
        ) : (
          <>
            <h1 className="render-progress-title">Почти готово</h1>
            <p className="render-progress-lead">
              {reservedCount > 0
                ? `Уже собираем ${reservedCount} из ${totalCount} ${pluralRu(totalCount, 'сцены', 'сцен', 'сцен')}. Остальные кадры ещё подрисовываются — закончите сборку в Студии, когда они будут готовы.`
                : 'Первые кадры ещё подрисовываются — обычно это занимает 30–60 секунд. Откройте проект в Студии и запустите сборку ещё раз через минуту.'}
            </p>
            <div className="render-progress-actions">
              <a className="render-progress-cta" href={`/projects/${props.projectId}`}>
                Открыть в Студии
              </a>
            </div>
            <p className="render-progress-reassure">Оплата зафиксирована, ничего не потеряется.</p>
          </>
        )}

        <details className="render-progress-details">
          <summary>Детали (для службы поддержки)</summary>
          <ul>
            <li>
              <span>Проект</span>
              <code>{props.projectId}</code>
            </li>
            {props.sceneJobIds.length > 0 && (
              <li>
                <span>Сцены в работе</span>
                <code>{props.sceneJobIds.length}</code>
              </li>
            )}
            {props.masterJobId && (
              <li>
                <span>Финальный клип</span>
                <code>{props.masterJobId}</code>
              </li>
            )}
            {props.partialError?.sceneErrors.map((e) => (
              <li key={e.scene_id}>
                <span>{e.scene_id}</span>
                <code>{e.error}</code>
              </li>
            ))}
            {props.partialError?.masterError && (
              <li>
                <span>Финальный клип</span>
                <code>{props.partialError.masterError}</code>
              </li>
            )}
          </ul>
        </details>
      </div>
    </main>
  );
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
