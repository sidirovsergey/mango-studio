'use client';

import { createProjectFromIdeaAction } from '@/server/actions/projects';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { LandingFooter } from './LandingFooter';
import { LandingInput } from './LandingInput';
import { LandingSuggestions } from './LandingSuggestions';

const AUTH_UI_ENABLED = process.env.NEXT_PUBLIC_AUTH_UI_ENABLED === 'true';

type Aspect = '9:16' | '16:9' | '1:1';
type Style = '3d_pixar' | '2d_drawn' | 'clay_art';

interface Props {
  userEmail?: string | null;
  isAnonymous?: boolean;
}

export function Landing({ userEmail = null, isAnonymous = true }: Props = {}) {
  const isAuthed = AUTH_UI_ENABLED && !isAnonymous && Boolean(userEmail);
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
        // Phase 1.8.2: new-CJM hero flow. Server action INSERTs the project
        // with status='generating_storyboard', fires script gen + first-frame
        // batch in the background via next/server.after(), and redirects to
        // /p/{public_slug}. The browser then renders LoadingView until status
        // flips to share-ready.
        await createProjectFromIdeaAction({
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
        <span className="name">
          Mango<span>Studio</span>
        </span>
      </div>
      <div className="landing-corner">
        <button type="button">Галерея</button>
        <button type="button">Цены</button>
        {AUTH_UI_ENABLED && isAuthed && userEmail && (
          <Link href="/profile" className="profile-pill" title="Профиль">
            <span className="profile-pill-avatar" aria-hidden="true">
              {userEmail.charAt(0).toUpperCase()}
            </span>
            <span className="profile-pill-email">{userEmail}</span>
          </Link>
        )}
        {AUTH_UI_ENABLED && !isAuthed && (
          <Link href="/login" className="login">
            Войти
          </Link>
        )}
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
          aspect={aspect}
          onAspectChange={setAspect}
          style={style}
          onStyleChange={setStyle}
          onSubmit={() => submit(idea)}
          submitting={isPending}
        />

        {error && (
          <div className="landing-error" role="alert">
            {error}
          </div>
        )}

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
