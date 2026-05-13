/**
 * Unified video prompt builder.
 *
 * Post-2026-05-13 (Kalashnikov simplification): one prompt format for every
 * engine. Active engines — Grok Imagine Video, Seedance 2.0 Pro, Veo 3.1 —
 * all accept structured text prompts and respond well to the same block
 * grammar (AESTHETIC / SCENE / SUBJECT / ACTION / CAMERA / AUDIO /
 * PERFORMANCE / MICRO ACTION / Pacing/Style / Avoid).
 *
 * Previous per-engine builders (seedance-lite, kling-2.5, ltx, generic, veo-3.1
 * variants) deleted alongside the legacy models — they targeted engines that
 * are no longer user-selectable. The shared implementation lives in
 * `seedance-2.ts`; the filename is historical (Seedance 2.0 was the first
 * engine on this template), the function itself is engine-agnostic.
 *
 * If a future engine genuinely needs a different format, branch here — but
 * resist: the user's strongest preference is fewer moving parts over
 * marginal per-engine quality gains.
 */

import { buildSeedance2Prompt } from './seedance-2';
import type { VideoPromptInput, VideoPromptOutput } from './types';

export type {
  VideoPromptInput,
  VideoPromptSceneInput,
  VideoPromptOutput,
  CharacterInScene,
} from './types';

export function buildVideoPrompt(input: VideoPromptInput): VideoPromptOutput {
  return buildSeedance2Prompt(input);
}
