import { StageHead } from '../shared/StageHead';

interface CharacterCard {
  charId: string;
  emoji: string;
  name: string;
  description: string;
  variant?: 'crab';
  generating?: boolean;
}

const CHARACTERS: CharacterCard[] = [
  {
    charId: 'dolphin',
    emoji: '🐬',
    name: 'Дэнни',
    description: 'Оптимистичный дельфин, ищет работу. С новыми очками.',
  },
  {
    charId: 'crab',
    emoji: '🦀',
    name: 'Джек',
    description: 'Сердитый менеджер по найму. Сидит за столом из коралла.',
    variant: 'crab',
    generating: true,
  },
];

interface CharActionBtnProps {
  act: string;
  title: string;
  path: string;
}

function CharActionBtn({ act, title, path }: CharActionBtnProps) {
  return (
    <button type="button" className="icon-btn" data-act={act} title={title}>
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
        aria-label={title}
      >
        <title>{title}</title>
        <path d={path} />
      </svg>
    </button>
  );
}

export function StageCharacters() {
  return (
    <section className="stage" data-stage>
      <StageHead num="02" title="Персонажи">
        <span className="section-tag">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: 'var(--leaf-500)',
              boxShadow: '0 0 0 3px rgba(31,179,100,0.18)',
            }}
          />
          2 готовы
        </span>
        <div style={{ flex: 1 }} />
        <div className="stage-meta">Nano Banana 2</div>
      </StageHead>

      <div className="char-grid">
        {CHARACTERS.map((c) => (
          <div
            key={c.charId}
            className={`char-card${c.variant ? ` ${c.variant}` : ''}${c.generating ? ' generating' : ''}`}
            data-char={c.charId}
          >
            <div className="char-avatar">{c.emoji}</div>
            <div className="char-info">
              <div className="char-name">{c.name}</div>
              <div className="char-desc">{c.description}</div>
            </div>
            <div className="char-actions">
              <CharActionBtn
                act="regen"
                title="Перегенерировать"
                path="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"
              />
              <CharActionBtn
                act="refine"
                title="Уточнить промптом"
                path="M12 20l4-4M3 21l3-9 9-9 6 6-9 9-9 3z"
              />
              <CharActionBtn act="model" title="Сменить модель" path="M4 6h16M4 12h16M4 18h16" />
              <CharActionBtn
                act="ref"
                title="Прикрепить референс"
                path="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
              />
            </div>
          </div>
        ))}

        <button type="button" className="char-add">
          <div className="plus">+</div>
          <div>Добавить персонажа</div>
        </button>
      </div>
    </section>
  );
}
