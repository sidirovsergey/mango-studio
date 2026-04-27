'use client';

import { Chat } from '@/components/chat/Chat';
import { ChatFab } from '@/components/chat/ChatFab';
import { BackgroundOrbs } from '@/components/effects/BackgroundOrbs';
import { Landing, type LandingChoice } from '@/components/landing/Landing';
import { Workspace } from '@/components/workspace/Workspace';
import { useState } from 'react';

export default function HomePage() {
  const [view, setView] = useState<'landing' | 'workspace'>('landing');
  const [choice, setChoice] = useState<LandingChoice | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

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
        <div className="app" data-chat-open={chatOpen ? '' : undefined}>
          <Chat />
          <Workspace
            initialIdea={choice.idea}
            initialFormat={choice.format}
            initialStyle={choice.style}
            onBackToLanding={() => setView('landing')}
          />
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismisses chat on tap; keyboard users use Esc on chat input or chat-fab focus. */}
          <div className="backdrop" onClick={() => setChatOpen(false)} aria-hidden={!chatOpen} />
          <ChatFab onClick={() => setChatOpen(true)} badge={2} />
        </div>
      )}
    </>
  );
}
