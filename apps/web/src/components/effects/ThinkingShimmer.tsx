'use client';

import { useEffect, useState } from 'react';

const STEPS = ['Прорабатываю персонажей…', 'Раскадровываю сцены…', 'Шлифую диалоги…'];

interface Props {
  active: boolean;
}

export function ThinkingShimmer({ active }: Props) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!active) {
      setStepIdx(0);
      return;
    }
    const interval = setInterval(() => {
      setStepIdx((i) => (i + 1) % STEPS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [active]);

  if (!active) return null;

  return (
    <div className="thinking-shimmer" style={{ padding: '24px 0' }}>
      <div
        className="thinking-shimmer-step"
        style={{
          fontSize: '15px',
          color: 'var(--ink-400)',
          marginBottom: '16px',
          animation: 'pulse 2.4s ease-in-out infinite',
        }}
      >
        {STEPS[stepIdx]}
      </div>
      <div className="thinking-shimmer-plates" style={{ display: 'grid', gap: '8px' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: '20px',
              borderRadius: '6px',
              background:
                'linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)',
              backgroundSize: '240% 100%',
              animation: `shimmer 1.6s ease-in-out infinite ${i * 0.18}s, pulse 2.4s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
