'use client';

type Aspect = '9:16' | '16:9' | '1:1';
type Style = '3d_pixar' | '2d_drawn' | 'clay_art';

interface Props {
  value: string;
  onChange: (v: string) => void;
  aspect: Aspect;
  onAspectChange: (a: Aspect) => void;
  style: Style;
  onStyleChange: (s: Style) => void;
  onSubmit: () => void;
  submitting?: boolean;
}

const STYLE_LABEL: Record<Style, string> = {
  '3d_pixar': '3D Pixar',
  '2d_drawn': '2D рисованный',
  'clay_art': 'Клей-арт',
};

export function LandingInput({
  value,
  onChange,
  aspect,
  onAspectChange,
  style,
  onStyleChange,
  onSubmit,
  submitting,
}: Props) {
  return (
    <div className="landing-input-shell">
      <div className="landing-input-row">
        <textarea
          id="landingInput"
          rows={2}
          placeholder="Например, «дельфин ищет работу и проходит собеседования с курьёзными ситуациями»…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
          disabled={submitting}
        />
        <button
          className="landing-send"
          id="landingSend"
          onClick={onSubmit}
          disabled={submitting || value.trim().length === 0}
        >
          {submitting ? 'Создаём…' : 'Создать'}
          <svg className="i" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </div>
      <div className="landing-tools">
        {(['9:16', '16:9', '1:1'] as Aspect[]).map((a) => (
          <button
            key={a}
            className={`tool-chip ${aspect === a ? 'active' : ''}`}
            onClick={() => onAspectChange(a)}
            type="button"
          >
            {a}
          </button>
        ))}
        <span className="sep" />
        {(['3d_pixar', '2d_drawn', 'clay_art'] as Style[]).map((s) => (
          <button
            key={s}
            className={`tool-chip ${style === s ? 'active' : ''}`}
            onClick={() => onStyleChange(s)}
            type="button"
          >
            {STYLE_LABEL[s]}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: "'Geist Mono',monospace", color: 'var(--ink-300)' }}>
          ⌘ + ⏎
        </span>
      </div>
    </div>
  );
}
