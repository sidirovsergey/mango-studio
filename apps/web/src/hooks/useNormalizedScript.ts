'use client';

import { type NormalizedScript, normalizeScript } from '@mango/core';
import { useMemo } from 'react';

/**
 * Phase 1.8.0a — memoised normaliser hook.
 *
 * Stage 03 / Stage 04 re-render many times per minute (typing, scene
 * regeneration, character chip clicks). normalizeScript() is pure JS over
 * ~8 scenes, but it does run Zod parse + allocate fresh objects. Memoise
 * per `script` object identity so re-renders without script change reuse
 * the previous normalisation result.
 *
 * Pass null/undefined and you get null back — keeps the hook honest about
 * Workspace boundaries where the script may not yet be loaded.
 */
export function useNormalizedScript(script: unknown | null | undefined): NormalizedScript | null {
  return useMemo(() => {
    if (!script) return null;
    return normalizeScript(script);
  }, [script]);
}
