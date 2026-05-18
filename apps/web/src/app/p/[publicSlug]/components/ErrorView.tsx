/**
 * Phase 1.8.2 — terminal error view for projects whose script generation
 * failed. createProjectFromIdeaAction's after() catch handler flips status
 * to `error`; the page lands here.
 *
 * For MVP, surface a friendly message + link back to the landing where
 * the user can retry. Manual retry from this URL deferred — would require
 * exposing project ownership to anon viewers (security boundary risk).
 */
export function ErrorView({ publicSlug }: { publicSlug: string }) {
  return (
    <main style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <h1>Не получилось сгенерировать раскадровку</h1>
      <p>
        Что-то пошло не так на нашей стороне. Идея сохранена; попробуйте создать раскадровку заново
        с лендинга.
      </p>
      <p style={{ marginTop: 24 }}>
        <a href="/">← Назад на лендинг</a>
      </p>
      <p style={{ marginTop: 24, fontSize: 12, opacity: 0.5 }}>
        Слаг проекта: {publicSlug}. Если ошибка повторяется — напишите в поддержку с этим ID.
      </p>
    </main>
  );
}
