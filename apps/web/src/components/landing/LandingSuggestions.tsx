'use client';

const SUGGESTIONS = [
  { emoji: '🐬', label: 'Дельфин ищет работу', prompt: 'дельфин ищет работу и проходит собеседования с курьёзными ситуациями' },
  { emoji: '🐱', label: 'Кот-космонавт', prompt: 'кот-космонавт впервые видит Землю из иллюминатора' },
  { emoji: '🍅', label: 'Побег с грядки', prompt: 'три помидора пытаются сбежать с грядки до того, как их соберут' },
  { emoji: '🦄', label: 'Свидание вслепую', prompt: 'стеснительный единорог идёт на свидание вслепую' },
];

interface Props {
  onPick: (prompt: string) => void;
  disabled?: boolean;
}

export function LandingSuggestions({ onPick, disabled }: Props) {
  return (
    <div className="landing-suggestions">
      {SUGGESTIONS.map((s) => (
        <button
          key={s.label}
          className="suggestion"
          data-prompt={s.prompt}
          onClick={() => onPick(s.prompt)}
          disabled={disabled}
        >
          <span className="emoji">{s.emoji}</span>
          {s.label}
        </button>
      ))}
    </div>
  );
}
