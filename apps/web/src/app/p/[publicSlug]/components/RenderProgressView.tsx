/**
 * Phase 1.7.1 — minimal render-in-progress view.
 *
 * Lists the enqueued job IDs. Polling of media_jobs.status for actual
 * scene-by-scene progress visualisation is Phase 1.8.4 work. Here we
 * just confirm to the user that the render has started.
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
  return (
    <main style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <h1>Рендер запущен</h1>

      {props.partialError ? (
        <section style={{ background: '#fff3cd', padding: 16, borderRadius: 8, marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Не все сцены удалось зарезервировать</h2>
          {props.partialError.sceneErrors.length > 0 && (
            <ul>
              {props.partialError.sceneErrors.map((e) => (
                <li key={e.scene_id}>
                  {e.scene_id}: {e.error}
                </li>
              ))}
            </ul>
          )}
          {props.partialError.masterError && (
            <p>Финальный клип: {props.partialError.masterError}</p>
          )}
          <p>Откройте проект в Студии, чтобы запустить повторно.</p>
        </section>
      ) : (
        <p>Сцены сабмитнуты на рендер. Это занимает 30–90 секунд.</p>
      )}

      <p style={{ marginTop: 24 }}>
        <a href={`/workspace/${props.projectId}`}>Открыть проект в Студии</a>
      </p>

      <details style={{ marginTop: 32, fontSize: 12, opacity: 0.6 }}>
        <summary>Детали (для отладки)</summary>
        <p>Проект: {props.projectId}</p>
        {props.sceneJobIds.length > 0 && (
          <ul>
            {props.sceneJobIds.map((id) => (
              <li key={id}>scene: {id}</li>
            ))}
          </ul>
        )}
        {props.masterJobId && <p>master: {props.masterJobId}</p>}
      </details>
    </main>
  );
}
