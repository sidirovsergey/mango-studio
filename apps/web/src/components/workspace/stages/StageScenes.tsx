import type { CSSProperties, ReactNode } from 'react';
import { StageHead } from '../shared/StageHead';

interface SceneAction {
  act: string;
  title: string;
  path: string;
}

const SCENE_ACTIONS: SceneAction[] = [
  {
    act: 'regen',
    title: 'Перегенерировать',
    path: 'M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5',
  },
  {
    act: 'edit',
    title: 'Редактировать',
    path: 'M3 21l3-9 9-9 6 6-9 9-9 3z',
  },
  {
    act: 'ref',
    title: 'Прикрепить референс',
    path: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  },
];

function SceneActions() {
  return (
    <div className="actions">
      {SCENE_ACTIONS.map((a) => (
        <button
          key={a.act}
          type="button"
          className="icon-btn"
          data-scene-act={a.act}
          title={a.title}
        >
          <svg
            className="i"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label={a.title}
          >
            <title>{a.title}</title>
            <path d={a.path} />
          </svg>
        </button>
      ))}
    </div>
  );
}

function PlayOverlay() {
  return (
    <div className="play">
      <svg
        className="i"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        style={{ fill: 'currentColor', stroke: 'none' }}
        role="img"
        aria-label="Воспроизвести"
      >
        <title>Воспроизвести</title>
        <path d="M7 5v14l12-7z" />
      </svg>
    </div>
  );
}

interface ReadyCardProps {
  num: string;
  duration: string;
  dialogue: string;
  model: string;
  silhouette: string;
  thumb: ReactNode;
}

function ReadySceneCard({ num, duration, dialogue, model, thumb }: ReadyCardProps) {
  return (
    <article className="scene-card">
      <div className="scene-thumb">
        {thumb}
        <PlayOverlay />
      </div>
      <div className="scene-tags">
        <span className="pill">
          {num} · {duration}
        </span>
        <span className="pill live">Готово</span>
      </div>
      <div className="scene-dialogue">{dialogue}</div>
      <div className="scene-foot">
        <span className="model">{model}</span>
        <SceneActions />
      </div>
    </article>
  );
}

interface LoadingCardProps {
  num: string;
  duration: string;
  status: 'generating' | 'queued';
  model: string;
}

function LoadingSceneCard({ num, duration, status, model }: LoadingCardProps) {
  const statusPillStyle: CSSProperties | undefined =
    status === 'generating'
      ? { background: 'rgba(245,118,0,0.1)', color: 'var(--mango-700)' }
      : undefined;
  const statusLabel = status === 'generating' ? 'Генерируется…' : 'В очереди';
  return (
    <article className="scene-card loading">
      <div className="scene-thumb" />
      <div className="scene-tags">
        <span className="pill">
          {num} · {duration}
        </span>
        <span className="pill" style={statusPillStyle}>
          {statusLabel}
        </span>
      </div>
      <div className="placeholder-text" />
      <div className="placeholder-text short" />
      <div className="scene-foot">
        <span className="model">{model}</span>
      </div>
    </article>
  );
}

interface ChipDef {
  label: string;
  active?: boolean;
  live?: boolean;
  id?: string;
}

interface ToolbarRowDef {
  label: string;
  group: string;
  chips: ChipDef[];
}

const TOOLBAR_ROWS: ToolbarRowDef[] = [
  {
    label: 'Видео',
    group: 'video',
    chips: [{ label: 'Veo 3.1 Lite', active: true }, { label: 'Seedance 2' }, { label: 'LTX 2.3' }],
  },
  {
    label: 'Озвучка',
    group: 'voice',
    chips: [
      { label: 'Встроенная Veo', live: true },
      { label: 'Eleven Labs' },
      { label: 'Без озвучки' },
    ],
  },
  {
    label: 'Музыка',
    group: 'music',
    chips: [
      { label: 'Без' },
      { label: 'Lo-Fi', active: true },
      { label: 'Эпик' },
      { label: 'Грустная' },
      { label: 'Загрузить…', id: 'musicUpload' },
    ],
  },
];

function chipClass(c: ChipDef): string {
  let cls = 'chip';
  if (c.active) cls += ' active';
  if (c.live) cls += ' live';
  return cls;
}

export function StageScenes() {
  return (
    <section className="stage" id="scenesStage" data-stage>
      <StageHead num="04" title="Сцены">
        <span className="section-tag">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: 'var(--mango-500)',
              boxShadow: '0 0 0 3px rgba(245, 118, 0, 0.2)',
            }}
          />
          3 / 5 готовы
        </span>
        <div style={{ flex: 1 }} />
        <div className="stage-meta">Veo 3.1 Lite · авто-озвучка</div>
      </StageHead>

      <div className="scenes">
        <ReadySceneCard
          num="01"
          duration="8 сек"
          dialogue="«Сегодня у меня собеседование. Я готов на всё, чтобы получить работу!»"
          model="Veo 3.1"
          silhouette="🐬"
          thumb={
            <>
              <div className="sky" />
              <div className="sun" />
              <div className="silhouette">🐬</div>
              <div className="ground" />
            </>
          }
        />
        <ReadySceneCard
          num="02"
          duration="6 сек"
          dialogue="«Так… в резюме написано &quot;хорошо плаваю&quot;. И это всё?»"
          model="Seedance"
          silhouette="🦀"
          thumb={
            <>
              <div
                className="sky"
                style={{ background: 'linear-gradient(180deg,#FFD9A8,#F8B26B)' }}
              />
              <div className="silhouette">🦀</div>
              <div
                className="ground"
                style={{ background: 'linear-gradient(180deg, transparent, #C58A4A)' }}
              />
            </>
          }
        />
        <ReadySceneCard
          num="03"
          duration="8 сек"
          dialogue="«Нам нужен кто-то, кто умеет печатать. У тебя даже пальцев нет!»"
          model="Veo 3.1"
          silhouette="🐬"
          thumb={
            <>
              <div
                className="sky"
                style={{ background: 'linear-gradient(180deg,#5FB6E8,#A6E1FF)' }}
              />
              <div className="silhouette">🐬</div>
              <div className="ground" />
              <div className="scan" />
            </>
          }
        />
        <LoadingSceneCard num="04" duration="8 сек" status="generating" model="LTX 2.3" />
        <LoadingSceneCard num="05" duration="10 сек" status="queued" model="Veo 3.1" />
      </div>

      <div className="cta-row">
        <div className="toolbar">
          {TOOLBAR_ROWS.map((row) => (
            <div key={row.group} className="toolbar-row">
              <span className="group-label">{row.label}</span>
              <div className="chip-row">
                {row.chips.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    className={chipClass(c)}
                    data-group={row.group}
                    id={c.id}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="cta" id="genRest">
          <svg
            className="i"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="Сгенерировать"
          >
            <title>Сгенерировать</title>
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          Сгенерировать оставшиеся
        </button>
      </div>
    </section>
  );
}
