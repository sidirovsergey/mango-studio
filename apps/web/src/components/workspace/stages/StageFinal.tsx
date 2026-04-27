import { Player } from '../shared/Player';
import { StageHead } from '../shared/StageHead';

interface ShareTarget {
  ico: 'tg' | 'vk' | 'yt' | 'dl';
  label: string;
  sub: string;
}

const SHARE_TARGETS: ShareTarget[] = [
  { ico: 'tg', label: 'Telegram', sub: 'Канал или личный чат' },
  { ico: 'vk', label: 'VK Видео', sub: 'Опубликовать в клипах' },
  { ico: 'yt', label: 'YouTube Shorts', sub: 'В один клик' },
  { ico: 'dl', label: 'Скачать MP4', sub: '9:16 · 1080p · 12 МБ' },
];

const ICO_TEXT: Record<ShareTarget['ico'], string> = {
  tg: 'Tg',
  vk: 'vk',
  yt: 'YT',
  dl: '↓',
};

export function StageFinal() {
  return (
    <section className="stage" data-stage>
      <StageHead num="05" title="Финал">
        <div style={{ flex: 1 }} />
        <div className="stage-meta">Черновая сборка</div>
      </StageHead>

      <div className="final">
        <Player silhouette="🐬" progress={0.38} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 24,
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
              color: 'var(--ink-900)',
            }}
          >
            «Дельфин, который искал работу»{' '}
            <span style={{ color: 'var(--ink-500)', fontStyle: 'italic' }}>
              — готовый рассказ за 40 секунд.
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--ink-500)',
              fontFamily: "'Geist Mono', monospace",
            }}
          >
            5 сцен · 9:16 · 1080p · с голосами
          </div>
          <div className="share-grid">
            {SHARE_TARGETS.map((s) => (
              <button key={s.ico} type="button" className="share-btn">
                <span className={`ico ${s.ico}`}>{ICO_TEXT[s.ico]}</span>
                <span className="label">
                  {s.label}
                  <span className="sub">{s.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
