'use client';

import { Chat } from '@/components/chat/Chat';
import { ChatFab } from '@/components/chat/ChatFab';
import { BackgroundOrbs } from '@/components/effects/BackgroundOrbs';
import { Landing, type LandingChoice } from '@/components/landing/Landing';
import { Workspace } from '@/components/workspace/Workspace';
import { useEffect, useRef, useState } from 'react';

type Phase = 'landing' | 'morphing' | 'workspace';

export default function HomePage() {
  const [phase, setPhase] = useState<Phase>('landing');
  const [choice, setChoice] = useState<LandingChoice | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const morphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (morphTimerRef.current !== null) {
        clearTimeout(morphTimerRef.current);
      }
    };
  }, []);

  const handleStart = (c: LandingChoice) => {
    setChoice(c);
    setPhase('morphing');
    if (morphTimerRef.current !== null) clearTimeout(morphTimerRef.current);
    morphTimerRef.current = setTimeout(() => setPhase('workspace'), 700);
  };

  const handleBack = () => {
    if (morphTimerRef.current !== null) clearTimeout(morphTimerRef.current);
    setPhase('landing');
    setChatOpen(false);
  };

  return (
    <div data-phase={phase}>
      <BackgroundOrbs />
      <Landing onStart={handleStart} />
      {choice && (
        <div className="app" data-chat-open={chatOpen ? '' : undefined}>
          <Chat />
          <Workspace
            initialIdea={choice.idea}
            initialFormat={choice.format}
            initialStyle={choice.style}
            onBackToLanding={handleBack}
          />
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismisses chat on tap; keyboard users use Esc on chat input or chat-fab focus. */}
          <div className="backdrop" onClick={() => setChatOpen(false)} aria-hidden={!chatOpen} />
          <ChatFab onClick={() => setChatOpen(true)} badge={2} />
        </div>
      )}
    </div>
  );
}
