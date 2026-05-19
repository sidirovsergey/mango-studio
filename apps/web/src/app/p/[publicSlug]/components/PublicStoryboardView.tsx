import type { PublicProjectView } from '@/server/lib/public-project-view';
import { ShareButton } from './ShareButton';
import { StickyCta } from './StickyCta';
import { StoryboardSceneCard } from './StoryboardSceneCard';

/**
 * Phase 1.8.1 — public storyboard render.
 *
 * Read-only RSC (no client interactivity except ShareButton + StickyCta).
 * Anyone with the slug URL can see this page; no auth required. The view
 * type is pre-allowlisted by toPublicProjectView — see that module for the
 * security boundary contract.
 */
export function PublicStoryboardView({
  project,
  hasError = false,
}: {
  project: PublicProjectView;
  hasError?: boolean;
}) {
  return (
    <main className="public-storyboard">
      <header className="public-storyboard-header">
        <h1 className="public-storyboard-title">
          {project.title || `Раскадровка ${project.public_slug}`}
        </h1>
        <div className="public-storyboard-meta">
          <span>
            Длительность ~{project.target_duration_sec} сек • {project.scenes_count}{' '}
            {project.scenes_count === 1 ? 'сцена' : project.scenes_count < 5 ? 'сцены' : 'сцен'}
          </span>
          <ShareButton publicSlug={project.public_slug} />
        </div>
      </header>

      {hasError && (
        <div
          className="public-storyboard-banner"
          role="status"
          aria-live="polite"
          style={{
            margin: '16px 0',
            padding: '12px 16px',
            borderRadius: 8,
            background: '#fff4e6',
            border: '1px solid #f6c789',
            color: '#7a4b00',
            fontSize: 14,
            lineHeight: 1.45,
          }}
        >
          Не удалось подготовить первые кадры. Попробуйте обновить страницу позже или создайте
          раскадровку заново — текстовая часть готова.
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

      {/* Sticky CTA at viewport bottom — render & studio entry points.
         Anon users see "Войдите" labels; the action wraps createTopupAction
         with intent.kind='render' or 'studio' so post-payment redirect
         dispatches the right surface. */}
      <StickyCta
        projectId={project.id}
        publicSlug={project.public_slug}
        renderPriceKopeks={project.price.render_kopeks}
        renderModifiers={project.price.render_modifiers}
      />

      {/* Spacer so sticky-CTA doesn't overlap the last scene card. */}
      <div className="public-storyboard-spacer" aria-hidden="true" style={{ height: 120 }} />
    </main>
  );
}
