import type { PublicScene } from '@/server/lib/public-project-view';

/**
 * Phase 1.8.1 — single scene card on the public storyboard.
 *
 * Layout (from new-CJM spec):
 *   ┌───────────────────────────────────────────────────────┐
 *   │ Сцена N · 0:00–0:10                                   │
 *   │ ┌──────────────┐ Литературный narrative_paragraph     │
 *   │ │ first_frame  │ «Реплика 1» — Cat                    │
 *   │ │ 16:9 jpg     │ «Реплика 2» — Dog                    │
 *   │ └──────────────┘                                      │
 *   └───────────────────────────────────────────────────────┘
 *
 * No edit affordances in 1.8.1 (those live in Pro-Студия). This view is
 * read-only sharing surface.
 */
export function StoryboardSceneCard({
  scene,
  sceneNumber,
  format,
}: {
  scene: PublicScene;
  sceneNumber: number;
  format: string;
}) {
  const aspectClass =
    format === '9:16' ? 'aspect-9-16' : format === '1:1' ? 'aspect-1-1' : 'aspect-16-9';
  return (
    <article className="storyboard-scene-card" data-scene-id={scene.scene_id}>
      <div className="scene-header">
        <span className="scene-number">Сцена {sceneNumber}</span>
        {scene.arc_role && <span className="scene-arc">· {arcLabel(scene.arc_role)}</span>}
        <span className="scene-duration">· {scene.duration_sec} сек</span>
      </div>
      <div className="scene-body">
        <div className={`scene-frame ${aspectClass}`}>
          {scene.first_frame_url ? (
            // External CDN URLs from fal.ai/Supabase signed URLs — next/image
            // optimizer would require remote pattern config we don't pin here.
            // Using plain <img> for 1.8.1 MVP; eventually 1.8.4 can wrap.
            <img
              src={scene.first_frame_url}
              alt={`Первый кадр сцены ${sceneNumber}`}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="scene-frame-placeholder" aria-hidden="true">
              <span>Кадр готовится…</span>
            </div>
          )}
        </div>
        <div className="scene-text">
          <p className="scene-narrative">{scene.narrative_paragraph}</p>
          {scene.dialogue.length > 0 && (
            <ul className="scene-dialogue-list">
              {scene.dialogue.map((d, i) => (
                <li key={`${scene.scene_id}-dlg-${i}-${d.speaker}`} className="scene-dialogue-line">
                  <em>«{d.text}»</em>
                  <span className="dialogue-speaker"> — {speakerLabel(d.speaker)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}

function arcLabel(arc: string): string {
  const map: Record<string, string> = {
    hook: 'хук',
    rising: 'развитие',
    climax: 'кульминация',
    payoff: 'развязка',
  };
  return map[arc] ?? arc;
}

function speakerLabel(speaker: string): string {
  const norm = speaker.trim().toLowerCase();
  if (!norm || norm === 'narrator' || norm === 'нарратор') return 'рассказчик';
  return speaker;
}
