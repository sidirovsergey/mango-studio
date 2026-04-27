'use client';

import { useState } from 'react';
import { LandingFooter } from './LandingFooter';
import { LandingInput } from './LandingInput';
import { LandingSuggestions } from './LandingSuggestions';

export type LandingFormat = '9:16' | '16:9' | '1:1';
export type LandingStyle = '3d_pixar' | '2d_drawn' | 'clay_art';

export interface LandingChoice {
  idea: string;
  format: LandingFormat;
  style: LandingStyle;
}

interface LandingProps {
  onStart: (choice: LandingChoice) => void;
}

export function Landing({ onStart }: LandingProps) {
  const [idea, setIdea] = useState('');
  const [format, setFormat] = useState<LandingFormat>('9:16');
  const [style, setStyle] = useState<LandingStyle>('3d_pixar');

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onStart({ idea: trimmed, format, style });
  };

  return (
    <section className="landing" id="landing">
      <div className="landing-brand">
        <span className="brand-mark" />
        <span className="name">
          Mango<span>Studio</span>
        </span>
      </div>
      <div className="landing-corner">
        <a href="/gallery">Галерея</a>
        <a href="/pricing">Цены</a>
        <a href="/login" className="login">
          Войти
        </a>
      </div>

      <div className="landing-stage">
        <span className="landing-eyebrow">
          <span className="pulse" />
          AI-режиссёр на связи
        </span>
        <h1 className="landing-headline">
          Мультик за <em>40&nbsp;секунд</em>.<br />
          Просто опиши идею.
        </h1>
        <p className="landing-sub">
          Mango сама подберёт персонажей, сценарий, голоса и сцены в стиле Pixar. Ты только
          направляешь.
        </p>
        <LandingInput
          value={idea}
          onChange={setIdea}
          onSubmit={() => submit(idea)}
          format={format}
          onFormatChange={setFormat}
          style={style}
          onStyleChange={setStyle}
        />
        <LandingSuggestions onPick={submit} />
      </div>

      <LandingFooter />
    </section>
  );
}
