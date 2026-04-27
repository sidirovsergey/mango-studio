import type { LandingFormat, LandingStyle } from '../../landing/Landing';
import { StageHead } from '../shared/StageHead';

interface Props {
  idea: string;
  format: LandingFormat;
  style: LandingStyle;
  durationSec?: number;
  genre?: string;
}

const FORMAT_LABEL: Record<LandingFormat, string> = {
  '9:16': 'Вертикаль',
  '16:9': 'Горизонталь',
  '1:1': 'Квадрат',
};

const STYLE_LABEL: Record<LandingStyle, string> = {
  '3d_pixar': '3D Pixar',
  '2d_drawn': '2D рисованный',
  clay_art: 'Клей-арт',
};

export function StageIdea({ idea, format, style, durationSec = 40, genre = 'Комедия' }: Props) {
  return (
    <section className="stage" data-stage>
      <StageHead num="01" title="Идея">
        <div className="stage-meta">Обновлено только что</div>
      </StageHead>

      <div className="idea-summary">
        <button type="button" className="meta-tile" data-edit="duration" title={idea}>
          <div className="key">Длительность</div>
          <div className="val">
            <em>{durationSec}</em> секунд
          </div>
        </button>
        <button type="button" className="meta-tile" data-edit="format">
          <div className="key">Формат</div>
          <div className="val">
            {format} · {FORMAT_LABEL[format]}
          </div>
        </button>
        <button type="button" className="meta-tile" data-edit="style">
          <div className="key">Стиль</div>
          <div className="val">{STYLE_LABEL[style]}</div>
        </button>
        <button type="button" className="meta-tile" data-edit="genre">
          <div className="key">Жанр</div>
          <div className="val">{genre}</div>
        </button>
      </div>

      <div className="ref-block">
        <div className="ref-head">
          <span className="ref-label">Референсы проекта</span>
          <span className="ref-count">2</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>
            Стиль и настроение для всех генераций
          </span>
        </div>
        <div className="ref-strip">
          <button type="button" className="ref-add" title="Добавить референс">
            <span className="plus">+</span>
            <span>Добавить</span>
          </button>
          <div
            className="ref-thumb"
            data-ref="aquarium"
            style={{ background: 'linear-gradient(160deg, #5FB6E8, #1F6FA8)' }}
            title="Аквариум · стиль освещения"
          >
            🐠<span className="ref-kind">Стиль</span>
            <button type="button" className="ref-x" title="Убрать">
              ×
            </button>
          </div>
          <div
            className="ref-thumb"
            data-ref="pixar"
            style={{ background: 'linear-gradient(160deg, #FFD394, #F57600)' }}
            title="Pixar · палитра"
          >
            ⭐<span className="ref-kind">Палитра</span>
            <button type="button" className="ref-x" title="Убрать">
              ×
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
