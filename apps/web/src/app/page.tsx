'use client';

import { BackgroundOrbs } from '@/components/effects/BackgroundOrbs';
import { Landing } from '@/components/landing/Landing';

export default function HomePage() {
  return (
    <>
      <BackgroundOrbs />
      <Landing
        onStart={(choice) => {
          // Wired in Task 83 (morph + Workspace mount).
          // biome-ignore lint/suspicious/noConsole: dev scaffold for Phase 0.8 progress preview.
          console.log('[Landing onStart]', choice);
        }}
      />
    </>
  );
}
