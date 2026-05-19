/**
 * Phase 1.8.2 — terminal error view (script generation failed AND no
 * recovery possible). When script was generated successfully but only
 * first-frames failed, page.tsx routes to PublicStoryboardView with the
 * hasError banner instead — see ../page.tsx for the recovery branch.
 */
export function ErrorView({ publicSlug }: { publicSlug: string }) {
  return (
    <main className="error-view">
      <div className="error-view-inner">
        <p className="error-view-eyebrow">Mango Studio · ошибка генерации</p>
        <h1>Не получилось собрать раскадровку</h1>
        <p>
          Что-то пошло не так на нашей стороне. Идея сохранена; попробуйте создать раскадровку
          заново с лендинга — обычно это помогает.
        </p>
        <a className="error-view-back-link" href="/">
          ← На лендинг
        </a>
        <p className="error-view-slug">
          ID: {publicSlug} · напишите в поддержку, если ошибка повторяется
        </p>
      </div>
    </main>
  );
}
