import { StageHead } from '../shared/StageHead';

interface Beat {
  id: number;
  duration: string;
  text: string;
}

const SCRIPT_SUMMARY =
  'Дэнни — молодой дельфин-оптимист, ищет свою первую работу. Он приходит к менеджеру-крабу Джеку и проходит несколько курьёзных собеседований: то у него нет пальцев для клавиатуры, то он слишком большой для офиса, то его «хорошо плаваю» никого не впечатляет. В финале Дэнни находит должность, которая идеально ему подходит — и о которой он даже не догадывался.';

const BEATS: Beat[] = [
  {
    id: 1,
    duration: '8 сек',
    text: 'Дэнни радостно подплывает к стойке регистрации с резюме в плавнике.',
  },
  { id: 2, duration: '6 сек', text: 'Джек, прищурившись, листает его резюме клешнёй.' },
  {
    id: 3,
    duration: '8 сек',
    text: 'Первая преграда: Дэнни не может печатать на клавиатуре — у него нет пальцев.',
  },
  {
    id: 4,
    duration: '8 сек',
    text: 'Вторая преграда: его не пускают в кабинет, потому что он не помещается в дверь.',
  },
  {
    id: 5,
    duration: '10 сек',
    text: 'Развязка: Джек предлагает ему стать инструктором по плаванию для младших крабиков. Идеально.',
  },
];

interface IconActionProps {
  id: string;
  title: string;
  path: string;
}

function StageHeadIconBtn({ id, title, path }: IconActionProps) {
  return (
    <button type="button" className="icon-btn" id={id} title={title}>
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

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function StageScript() {
  return (
    <section className="stage" id="scriptStage" data-stage>
      <StageHead num="03" title="Сценарий">
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
          Готов
        </span>
        <div style={{ flex: 1 }} />
        <StageHeadIconBtn
          id="scriptRegen"
          title="Перегенерировать сценарий"
          path="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"
        />
        <StageHeadIconBtn
          id="scriptRefine"
          title="Уточнить промптом"
          path="M12 20l4-4M3 21l3-9 9-9 6 6-9 9-9 3z"
        />
      </StageHead>

      <div className="script-summary" id="scriptSummary">
        {SCRIPT_SUMMARY}
      </div>

      <div className="beats-list" id="beatsList">
        {BEATS.map((b) => (
          <button key={b.id} type="button" className="beat" data-beat={b.id}>
            <span className="beat-num">{pad2(b.id)}</span>
            <span className="beat-duration">{b.duration}</span>
            <span className="beat-arrow">→</span>
            <span className="beat-text">{b.text}</span>
            <svg
              className="i beat-act"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              role="img"
              aria-label="Уточнить beat"
            >
              <title>Уточнить beat</title>
              <path d="M3 21l3-9 9-9 6 6-9 9-9 3z" />
            </svg>
          </button>
        ))}
      </div>
    </section>
  );
}
