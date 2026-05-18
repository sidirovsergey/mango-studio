'use client';

import { useState } from 'react';

/**
 * Phase 1.8.1 — copy-to-clipboard share button.
 *
 * Falls back to navigator.share() on mobile when available (single tap
 * → native share sheet), else copies the URL to clipboard and shows
 * a transient "Скопировано" toast.
 */
export function ShareButton({ publicSlug }: { publicSlug: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}/p/${publicSlug}`;
    // Prefer native share sheet on mobile.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'Раскадровка', url });
        return;
      } catch (err) {
        // User cancelled OR share not supported despite check; fall through.
        if (err instanceof Error && err.name !== 'AbortError') {
          // continue to clipboard fallback
        } else {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[share-button] clipboard failed', err);
    }
  }

  return (
    <button
      type="button"
      className="share-btn"
      onClick={handleShare}
      aria-label="Поделиться раскадровкой"
    >
      {copied ? 'Скопировано ✓' : 'Поделиться'}
    </button>
  );
}
