import type { PublicProjectView } from '@/server/lib/public-project-view';
import { ShareButton } from './ShareButton';
import { StickyCta } from './StickyCta';
import { StoryboardSceneCard } from './StoryboardSceneCard';

/**
 * Phase 1.8.1 — public storyboard render. Read-only RSC; security boundary
 * enforced by toPublicProjectView allowlist.
 *
 * Phase 1.8.x design pass: editorial-magazine layout. Styles live in
 * `../storyboard.css`, imported by page.tsx.
 */
export function PublicStoryboardView({
  project,
  hasError = false,
}: {
  project: PublicProjectView;
  hasError?: boolean;
}) {
  const sceneWord = scenePluralRu(project.scenes_count);

  return (
    <main className="public-storyboard">
      <header className="public-storyboard-header">
        <p className="public-storyboard-eyebrow">Mango Studio · Раскадровка</p>
        <h1 className="public-storyboard-title">
          {project.title || `Раскадровка ${project.public_slug}`}
        </h1>
        <div className="public-storyboard-meta">
          <span className="public-storyboard-meta-stats">
            <span>~{project.target_duration_sec} сек</span>
            <span className="dot" aria-hidden="true" />
            <span>
              {project.scenes_count} {sceneWord}
            </span>
          </span>
          <ShareButton publicSlug={project.public_slug} />
        </div>
      </header>

      {hasError && (
        <div className="public-storyboard-banner" role="status" aria-live="polite">
          Первые кадры подготовить не удалось — текст раскадровки готов. Попробуйте обновить
          страницу позже или создайте раскадровку заново.
        </div>
      )}

      <section className="public-storyboard-scenes">
        {project.scenes.map((scene, idx) => (
          <StoryboardSceneCard
            key={scene.scene_id}
            scene={scene}
            sceneNumber={idx + 1}
            format={project.format}
          />
        ))}
      </section>

      <StickyCta
        projectId={project.id}
        publicSlug={project.public_slug}
        renderPriceKopeks={project.price.render_kopeks}
        renderModifiers={project.price.render_modifiers}
      />

      <div className="public-storyboard-spacer" aria-hidden="true" />
    </main>
  );
}

function scenePluralRu(n: number): string {
  // Russian plural: 1 сцена, 2-4 сцены, 5+ сцен, 11-14 сцен.
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'сцен';
  if (mod10 === 1) return 'сцена';
  if (mod10 >= 2 && mod10 <= 4) return 'сцены';
  return 'сцен';
}
