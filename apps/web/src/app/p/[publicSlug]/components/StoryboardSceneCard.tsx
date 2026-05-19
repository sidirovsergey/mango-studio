import type { PublicScene } from '@/server/lib/public-project-view';

/**
 * Phase 1.8.1 — single scene card.
 * Phase 1.8.x design pass: editorial asymmetric layout with magazine
 * numerals as decorative pull-quotes (rendered via CSS ::before reading
 * `data-numeral`). See ../storyboard.css for the design system.
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
  // Format the numeral with a leading zero for visual rhythm: 01, 02, 03…
  const numeral = sceneNumber.toString().padStart(2, '0');

  return (
    <article className="storyboard-scene-card" data-scene-id={scene.scene_id}>
      <div className={`scene-frame ${aspectClass}`} data-numeral={numeral}>
        {scene.first_frame_url ? (
          <img
            src={scene.first_frame_url}
            alt={`Первый кадр сцены ${sceneNumber}`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="scene-frame-placeholder" aria-label="Кадр готовится">
            <span aria-hidden="true">Кадр готовится</span>
          </div>
        )}
      </div>
      <div className="scene-text">
        <header className="scene-header">
          <span className="scene-number">Сцена {numeral}</span>
          {scene.arc_role && <span className="scene-arc">/ {arcLabel(scene.arc_role)}</span>}
          <span className="scene-duration">/ {scene.duration_sec} сек</span>
        </header>
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
    </article>
  );
}

function arcLabel(arc: string): string {
  const map: Record<string, string> = {
    hook: 'хук',
    setup: 'завязка',
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
