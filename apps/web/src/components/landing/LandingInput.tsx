'use client';

import type { KeyboardEvent } from 'react';
import type { LandingFormat, LandingStyle } from './Landing';

interface LandingInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  format: LandingFormat;
  onFormatChange: (f: LandingFormat) => void;
  style: LandingStyle;
  onStyleChange: (s: LandingStyle) => void;
}

const FORMATS: LandingFormat[] = ['9:16', '16:9', '1:1'];
const STYLE_LABELS: Array<{ id: LandingStyle; label: string }> = [
  { id: '3d_pixar', label: '3D Pixar' },
  { id: '2d_drawn', label: '2D рисованный' },
  { id: 'clay_art', label: 'Клей-арт' },
];

export function LandingInput({
  value,
  onChange,
  onSubmit,
  format,
  onFormatChange,
  style,
  onStyleChange,
}: LandingInputProps) {
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="landing-input-shell">
      <div className="landing-input-row">
        <textarea
          id="landingInput"
          rows={2}
          placeholder="Например, «дельфин ищет работу и проходит собеседования с курьёзными ситуациями»…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
        />
        <button className="landing-send" id="landingSend" type="button" onClick={onSubmit}>
          Создать
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
            aria-label="Стрелка вправо"
          >
            <title>Стрелка вправо</title>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      <div className="landing-tools">
        {FORMATS.map((f) => (
          <button
            key={f}
            type="button"
            className={`tool-chip${f === format ? ' active' : ''}`}
            onClick={() => onFormatChange(f)}
          >
            {f}
          </button>
        ))}
        <span className="sep" />
        {STYLE_LABELS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`tool-chip${id === style ? ' active' : ''}`}
            onClick={() => onStyleChange(id)}
          >
            {label}
          </button>
        ))}
        <span className="kbd-hint">⌘ + ⏎</span>
      </div>
    </div>
  );
}
