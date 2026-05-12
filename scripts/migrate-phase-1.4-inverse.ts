/**
 * CLI: Phase-1.4 → Phase-1.3.5 inverse migration (emergency rollback only).
 *
 * Iterates all rows in `projects`, calls downgradeScript_1_4 on each script JSONB to strip
 * Phase-1.4-only fields, and writes back the stripped shape.
 *
 * IMPORTANT LOSSY FIELDS — NOT recoverable after downgrade:
 *   - description_ru / description_en (scene level)
 *   - composition, camera_movement, lighting, audio_direction, arc_role (scene level)
 *   - tier_at_gen (scene level)
 *   - visual_theme, tier (script root level)
 *   - narrator_voice.persona
 *
 * VOICE IDs: the 4 remapped IDs (Rachel/Domi/Antoni/Arnold → Janet/Jessica/George/Daniel) are
 * NOT reverted because the original IDs are MISSING in ElevenLabs (would silently break TTS).
 * Phase-1.4 voice IDs are preserved in the downgraded shape.
 *
 * Usage:
 *   pnpm exec tsx scripts/migrate-phase-1.4-inverse.ts [--dry-run] [--env=staging|production]
 *
 * Required env vars:
 *   SUPABASE_URL_STAGING / SUPABASE_URL_PRODUCTION
 *   SUPABASE_SERVICE_ROLE_KEY_STAGING / SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
 */

import { downgradeScript_1_4 } from '@mango/core/llm/migration-1.4';
import type { Script } from '@mango/core/llm/schemas';
import { createClient } from '@supabase/supabase-js';

const PAGE_SIZE = 100;

/** Detect if a script looks like a Phase-1.4 shape (has description_en on scenes). */
function isPhase14(script: unknown): boolean {
  if (!script || typeof script !== 'object') return false;
  const s = script as Record<string, unknown>;
  const scenes = Array.isArray(s.scenes) ? s.scenes : [];
  return (
    scenes.length > 0 &&
    scenes.some(
      (scene: unknown) =>
        scene &&
        typeof scene === 'object' &&
        'description_en' in (scene as Record<string, unknown>),
    )
  );
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  const env = process.argv.includes('--env=production') ? 'production' : 'staging';

  const urlKey = `SUPABASE_URL_${env.toUpperCase()}`;
  const roleKey = `SUPABASE_SERVICE_ROLE_KEY_${env.toUpperCase()}`;
  const url = process.env[urlKey];
  const key = process.env[roleKey];

  if (!url || !key) {
    console.error(`[migrate-1.4-inverse] ERROR: Missing env vars ${urlKey} and/or ${roleKey}`);
    console.error('[migrate-1.4-inverse] Provide them in the environment before running, e.g.:');
    console.error(
      `[migrate-1.4-inverse]   ${urlKey}=https://xxx.supabase.co ${roleKey}=service_role_key_here pnpm exec tsx scripts/migrate-phase-1.4-inverse.ts`,
    );
    process.exit(1);
  }

  console.log(`[migrate-1.4-inverse] env=${env} dry-run=${isDryRun}`);
  console.log(`[migrate-1.4-inverse] Connecting to ${url.replace(/\/\/.*@/, '//<credentials>@')}…`);
  console.warn(
    '[migrate-1.4-inverse] WARNING: This is an emergency rollback. Phase-1.4 fields will be' +
      ' permanently lost. Voice IDs will NOT be reverted (old IDs are dead in ElevenLabs).',
  );

  const sb = createClient(url, key, {
    auth: { persistSession: false },
  });

  let processed = 0;
  let downgraded = 0;
  let skipped = 0;
  let errors = 0;
  let page = 0;

  console.log('[migrate-1.4-inverse] Starting pagination…');

  while (true) {
    const { data: rows, error } = await sb
      .from('projects')
      .select('id, script')
      .order('id')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      console.error(`[migrate-1.4-inverse] FATAL: failed to fetch page ${page}: ${error.message}`);
      process.exit(1);
    }

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      processed++;
      const projectId = row.id as string;

      try {
        if (!isPhase14(row.script)) {
          skipped++;
          continue;
        }

        const legacy = downgradeScript_1_4(row.script as Script);

        if (!isDryRun) {
          const { error: upErr } = await sb
            .from('projects')
            .update({ script: legacy })
            .eq('id', projectId);

          if (upErr) {
            console.error(`[migrate-1.4-inverse] FAIL project=${projectId}: ${upErr.message}`);
            errors++;
            continue;
          }
        } else {
          console.log(`[migrate-1.4-inverse] [DRY] project=${projectId} would be downgraded`);
        }

        downgraded++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[migrate-1.4-inverse] ERROR project=${projectId}: ${msg}`);
        errors++;
      }
    }

    console.log(
      `[migrate-1.4-inverse] Page ${page}: processed=${processed} downgraded=${downgraded} ` +
        `skipped=${skipped} errors=${errors}`,
    );

    if (rows.length < PAGE_SIZE) break;
    page++;
  }

  console.log('[migrate-1.4-inverse] ——————————————————————————————————————');
  console.log(
    `[migrate-1.4-inverse] DONE: total_processed=${processed} downgraded=${downgraded} skipped=${skipped} errors=${errors}`,
  );

  if (isDryRun) {
    console.log('[migrate-1.4-inverse] DRY RUN complete — no rows written.');
  }

  if (errors > 0) {
    console.error(`[migrate-1.4-inverse] ${errors} projects had errors — review logs above.`);
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error('[migrate-1.4-inverse] Unhandled error:', e);
  process.exit(1);
});
