import 'server-only';

/**
 * Sync-reconcile loop for CJM character preflight.
 *
 * # Why this exists
 *
 * `createProjectFromIdeaAction.after()` used to run `generateScriptAction`
 * then immediately `generateAllFirstFramesAction`. At bulk-submit time the
 * character `dossier` had no `storage` and no `reference_image` because
 * dossier generation only fires when the user clicks "Сгенерировать досье"
 * in workspace. Result: every scene's first_frame submitted to fal with
 * `image_refs=[]`, and nano-banana freely interpreted "Финн" differently
 * per scene → user saw 4 visibly different characters in the storyboard.
 *
 * This preflight runs BEFORE bulk first_frames:
 *   1. Submits `character_dossier` (which also kicks off `character_avatar`
 *      in parallel) for every character lacking `dossier.storage`.
 *   2. Polls via the shared `pollMediaJobsAction` until each character has
 *      `dossier.reference_image` populated, or a 90s budget elapses.
 *   3. The F53 chain in `pollMediaJobsAction.finalizeCompleted` auto-fires
 *      `generateReferenceImageAction` after each dossier completes. We
 *      MUST keep `skipReferenceRecovery: false` here (opposite of the
 *      first-frame reconcile loop) so that chain runs.
 *
 * Once preflight returns `completed`, bulk first_frames will pick up
 * `character.dossier.reference_image` in `buildFirstFramePrompt` and
 * generate visually-consistent characters across scenes.
 *
 * # Result contract
 *
 * - `completed` — every active character has `dossier.reference_image`.
 *   Safe to proceed to bulk first_frames with full image-anchoring.
 *
 * - `budget_exceeded` — budget ran out with one or more characters still
 *   lacking ref_image. Per Codex audit answer Q3: caller LOGS LOUDLY and
 *   PROCEEDS to bulk first_frames anyway (degraded consistency is better
 *   than no storyboard). The affected scenes will look inconsistent but
 *   the user still gets a usable artifact.
 *
 * - `poll_failed` — `pollMediaJobsAction` returned ok:false (auth /
 *   permission). No recovery inside the loop. Caller proceeds.
 *
 * - `script_unavailable` — failed to read the project's script (DB blip).
 *   Caller proceeds.
 *
 * - `no_op` — script has no characters needing preflight at all. Fast
 *   path; skip the loop entirely.
 *
 * # Dependencies
 *
 * Injected for testability. `submitDossier` returns the action's discriminated
 * result; `readCharacters` reads the latest character state from the DB
 * (refreshes on each tick so finalize-completed writes are visible);
 * `poll` is `pollMediaJobsAction`; `sleep`/`now` are time controls.
 */

import type { Character } from '@mango/core';

export type CharacterPreflightResult =
  | { status: 'no_op'; reason: 'no_characters' | 'all_ready' }
  | {
      status: 'completed';
      ticks: number;
      elapsed_ms: number;
      ready_count: number;
      submitted_character_ids: string[];
    }
  | {
      status: 'budget_exceeded';
      ticks: number;
      elapsed_ms: number;
      ready_count: number;
      missing_character_ids: string[];
    }
  | {
      status: 'poll_failed';
      ticks: number;
      elapsed_ms: number;
      error: string;
    }
  | {
      status: 'script_unavailable';
      ticks: number;
      elapsed_ms: number;
      error: string;
    };

export interface CharacterPreflightDeps {
  /**
   * Read the project's active (non-archived) characters from the DB.
   * Refreshed every tick so finalize-completed writes are visible.
   */
  readCharacters(
    project_id: string,
  ): Promise<{ ok: true; characters: Character[] } | { ok: false; error: string }>;
  /** Submit a character_dossier job. Returns the action's discriminated result. */
  submitDossier(args: {
    project_id: string;
    character_id: string;
  }): Promise<{ ok: true; job_id: string } | { ok: false; error: string }>;
  /**
   * One poll tick. `skipReferenceRecovery: false` so the F53 chain fires
   * `generateReferenceImageAction` after each dossier completes.
   */
  poll(args: {
    project_id: string;
    skipReferenceRecovery?: boolean;
  }): Promise<{ ok: true } | { ok: false; error: string }>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

export interface CharacterPreflightConfig {
  initial_delay_ms?: number;
  poll_interval_ms?: number;
  budget_ms?: number;
}

const DEFAULT_INITIAL_DELAY_MS = 2_000;
const DEFAULT_POLL_INTERVAL_MS = 4_000;
const DEFAULT_BUDGET_MS = 90_000;

/**
 * A character is "ready" for first_frame anchoring once `dossier.reference_image`
 * is populated (storage descriptor present). We do NOT require avatar — the
 * 1:1 portrait is for UI display, not for nano-banana image refs.
 */
function isCharacterReady(c: Character): boolean {
  return c.dossier?.reference_image != null;
}

/**
 * A character needs a fresh dossier submit when `dossier.storage` is absent.
 * If `dossier.storage` exists but `dossier.reference_image` is still null,
 * the F53 chain in `pollMediaJobsAction.finalizeCompleted` will fire the
 * reference_image job automatically — no manual resubmit (per Codex
 * audit clarification on preflight states).
 */
function needsDossierSubmit(c: Character): boolean {
  return c.dossier?.storage == null;
}

export async function reconcileCharacterPreflight(
  args: { project_id: string },
  deps: CharacterPreflightDeps,
  config: CharacterPreflightConfig = {},
): Promise<CharacterPreflightResult> {
  const initial_delay_ms = config.initial_delay_ms ?? DEFAULT_INITIAL_DELAY_MS;
  const poll_interval_ms = config.poll_interval_ms ?? DEFAULT_POLL_INTERVAL_MS;
  const budget_ms = config.budget_ms ?? DEFAULT_BUDGET_MS;

  // Fast path: read initial state before submitting anything.
  const initialRead = await deps.readCharacters(args.project_id);
  if (!initialRead.ok) {
    return {
      status: 'script_unavailable',
      ticks: 0,
      elapsed_ms: 0,
      error: initialRead.error,
    };
  }
  const initialChars = initialRead.characters;
  if (initialChars.length === 0) {
    return { status: 'no_op', reason: 'no_characters' };
  }
  if (initialChars.every(isCharacterReady)) {
    return { status: 'no_op', reason: 'all_ready' };
  }

  // Submit dossier for every character missing `dossier.storage`. Submit
  // serially so reserveMediaJob's per-user advisory lock doesn't see a
  // burst — sequential keeps quota accounting clean. Each call is ~50-100ms
  // for the submit step (fal accepts async; result lands minutes later).
  const submitted_character_ids: string[] = [];
  for (const c of initialChars) {
    if (!needsDossierSubmit(c)) continue;
    try {
      const r = await deps.submitDossier({
        project_id: args.project_id,
        character_id: c.id,
      });
      if (r.ok) {
        submitted_character_ids.push(c.id);
      } else {
        console.warn('[preflight] submitDossier returned ok:false', {
          project_id: args.project_id,
          character_id: c.id,
          name: c.name,
          error: r.error,
        });
      }
    } catch (e) {
      console.warn('[preflight] submitDossier threw', {
        project_id: args.project_id,
        character_id: c.id,
        name: c.name,
        errMessage: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Now poll. The F53 chain auto-fires reference_image after each dossier
  // completes, so we don't need to manually submit reference_image jobs —
  // we just need pollMediaJobsAction to keep advancing the pipeline.
  await deps.sleep(initial_delay_ms);
  const start = deps.now();
  let ticks = 0;

  while (deps.now() - start < budget_ms) {
    ticks++;

    let pollResult: Awaited<ReturnType<CharacterPreflightDeps['poll']>>;
    try {
      pollResult = await deps.poll({
        project_id: args.project_id,
        skipReferenceRecovery: false,
      });
    } catch (e) {
      // Transient — continue ticking; budget eventually exits.
      console.warn('[preflight] poll threw', {
        project_id: args.project_id,
        tick: ticks,
        errMessage: e instanceof Error ? e.message : String(e),
      });
      await deps.sleep(poll_interval_ms);
      continue;
    }

    if (!pollResult.ok) {
      return {
        status: 'poll_failed',
        ticks,
        elapsed_ms: deps.now() - start,
        error: pollResult.error,
      };
    }

    const tickRead = await deps.readCharacters(args.project_id);
    if (!tickRead.ok) {
      // Single tick's read failed — keep ticking; the next read may succeed.
      console.warn('[preflight] readCharacters threw mid-loop', {
        project_id: args.project_id,
        tick: ticks,
        error: tickRead.error,
      });
      await deps.sleep(poll_interval_ms);
      continue;
    }

    const readyNow = tickRead.characters.filter(isCharacterReady).length;
    const totalNow = tickRead.characters.length;
    if (readyNow === totalNow) {
      return {
        status: 'completed',
        ticks,
        elapsed_ms: deps.now() - start,
        ready_count: readyNow,
        submitted_character_ids,
      };
    }

    await deps.sleep(poll_interval_ms);
  }

  // Budget exceeded. Final read for accurate `missing_character_ids` log.
  const finalRead = await deps.readCharacters(args.project_id);
  const missing_character_ids = finalRead.ok
    ? finalRead.characters.filter((c) => !isCharacterReady(c)).map((c) => c.id)
    : [];
  const ready_count = finalRead.ok ? finalRead.characters.filter(isCharacterReady).length : -1;

  return {
    status: 'budget_exceeded',
    ticks,
    elapsed_ms: deps.now() - start,
    ready_count,
    missing_character_ids,
  };
}
