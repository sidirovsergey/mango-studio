'use client';

import { BackgroundOrbs } from '@/components/effects/BackgroundOrbs';
import { Landing, type LandingChoice } from '@/components/landing/Landing';
import { Workspace } from '@/components/workspace/Workspace';
import { useState } from 'react';

export default function HomePage() {
  const [view, setView] = useState<'landing' | 'workspace'>('landing');
  const [choice, setChoice] = useState<LandingChoice | null>(null);

  return (
    <>
      <BackgroundOrbs />
      {view === 'landing' && (
        <Landing
          onStart={(c) => {
            setChoice(c);
            setView('workspace');
          }}
        />
      )}
      {view === 'workspace' && choice && (
        <Workspace
          initialIdea={choice.idea}
          initialFormat={choice.format}
          initialStyle={choice.style}
          onBackToLanding={() => setView('landing')}
        />
      )}
    </>
  );
}
