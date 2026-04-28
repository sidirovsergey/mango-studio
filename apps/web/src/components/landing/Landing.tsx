'use client';

import { useState, useTransition } from 'react';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { LandingInput } from './LandingInput';
import { LandingSuggestions } from './LandingSuggestions';
import { LandingFooter } from './LandingFooter';
import { createProjectAction } from '@/server/actions/projects';

type Aspect = '9:16' | '16:9' | '1:1';
type Style = '3d_pixar' | '2d_drawn' | 'clay_art';

export function Landing() {
  const [idea, setIdea] = useState('');
  const [aspect, setAspect] = useState<Aspect>('9:16');
  const [style, setStyle] = useState<Style>('3d_pixar');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (text: string) => {
    if (text.trim().length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        await createProjectAction({
          idea: text.trim(),
          style,
          format: aspect,
          target_duration_sec: 40,
        });
      } catch (err) {
        if (isRedirectError(err)) throw err;
        setError(err instanceof Error ? err.message : 'Не получилось создать проект');
      }
    });
  };

  return (
    <section className="landing" id="landing">
      <div className="landing-brand">
        <span className="brand-mark" />
        <span className="name">Mango<span>Studio</span></span>
      </div>
      <div className="landing-corner">
        <a href="#">Галерея</a>
        <a href="#">Цены</a>
        <a href="#" className="login">Войти</a>
      </div>

      <div className="landing-stage">
        <span className="landing-eyebrow">
          <span className="pulse" />
          AI-режиссёр на связи
        </span>
        <h1 className="landing-headline">
          Мультик за <em>40&nbsp;секунд</em>.<br />Просто опиши идею.
        </h1>
        <p className="landing-sub">
          Mango сама подберёт персонажей, сценарий, голоса и сцены в стиле Pixar. Ты только направляешь.
        </p>

        <LandingInput
          value={idea}
          onChange={setIdea}
          aspect={aspect}
          onAspectChange={setAspect}
          style={style}
          onStyleChange={setStyle}
          onSubmit={() => submit(idea)}
          submitting={isPending}
        />

        {error && <div className="landing-error" role="alert">{error}</div>}

        <LandingSuggestions
          onPick={(s) => {
            setIdea(s);
            submit(s);
          }}
          disabled={isPending}
        />
      </div>

      <LandingFooter />
    </section>
  );
}
