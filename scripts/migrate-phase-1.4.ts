/**
 * CLI: Phase-1.3.5 → Phase-1.4 migration.
 *
 * Iterates all rows in `projects`, calls upgradeScript_1_4 on each script JSONB, and writes
 * back the upgraded shape. Idempotent: already-upgraded rows are detected and skipped.
 *
 * Usage:
 *   pnpm exec tsx scripts/migrate-phase-1.4.ts [--dry-run] [--env=staging|production]
 *
 * Required env vars:
 *   SUPABASE_URL_STAGING / SUPABASE_URL_PRODUCTION
 *   SUPABASE_SERVICE_ROLE_KEY_STAGING / SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
 *
 * VOICE ID NOTE: this migration remaps 4 stale ElevenLabs voice IDs that return 404 in the
 * live catalog. See packages/core/src/llm/migration-1.4.ts for the full remap table.
 */

import { type MigrationStats, upgradeScript_1_4 } from '@mango/core/llm/migration-1.4';
import { createClient } from '@supabase/supabase-js';

const PAGE_SIZE = 100;

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  const env = process.argv.includes('--env=production') ? 'production' : 'staging';

  const urlKey = `SUPABASE_URL_${env.toUpperCase()}`;
  const roleKey = `SUPABASE_SERVICE_ROLE_KEY_${env.toUpperCase()}`;
  const url = process.env[urlKey];
  const key = process.env[roleKey];

  if (!url || !key) {
    console.error(`[migrate-1.4] ERROR: Missing env vars ${urlKey} and/or ${roleKey}`);
    console.error('[migrate-1.4] Provide them in the environment before running, e.g.:');
    console.error(
      `[migrate-1.4]   ${urlKey}=https://xxx.supabase.co ${roleKey}=service_role_key_here pnpm exec tsx scripts/migrate-phase-1.4.ts`,
    );
    process.exit(1);
  }

  console.log(`[migrate-1.4] env=${env} dry-run=${isDryRun}`);
  console.log(`[migrate-1.4] Connecting to ${url.replace(/\/\/.*@/, '//<credentials>@')}…`);

  const sb = createClient(url, key, {
    auth: { persistSession: false },
  });

  const cumulative: MigrationStats = {
    scripts_upgraded: 0,
    scenes_upgraded: 0,
    characters_upgraded: 0,
    voice_ids_remapped: 0,
    voice_description_dropped: 0,
  };
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let page = 0;

  console.log('[migrate-1.4] Starting pagination…');

  while (true) {
    const { data: rows, error } = await sb
      .from('projects')
      .select('id, script, tier')
      .order('id')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      console.error(`[migrate-1.4] FATAL: failed to fetch page ${page}: ${error.message}`);
      process.exit(1);
    }

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      processed++;
      const projectId = row.id as string;

      try {
        const { upgraded, stats } = upgradeScript_1_4(row.script, {
          project_tier: (row.tier as string | undefined) ?? 'economy',
        });

        // If stats say 0 scripts_upgraded, it was already 1.4 — skip write
        if ((stats.scripts_upgraded ?? 0) === 0) {
          skipped++;
          continue;
        }

        if (!isDryRun) {
          const { error: upErr } = await sb
            .from('projects')
            .update({ script: upgraded })
            .eq('id', projectId);

          if (upErr) {
            console.error(`[migrate-1.4] FAIL project=${projectId}: ${upErr.message}`);
            errors++;
            continue;
          }
        }

        cumulative.scripts_upgraded += stats.scripts_upgraded ?? 0;
        cumulative.scenes_upgraded += stats.scenes_upgraded ?? 0;
        cumulative.characters_upgraded += stats.characters_upgraded ?? 0;
        cumulative.voice_ids_remapped += stats.voice_ids_remapped ?? 0;
        cumulative.voice_description_dropped += stats.voice_description_dropped ?? 0;

        if (isDryRun) {
          console.log(
            `[migrate-1.4] [DRY] project=${projectId} scenes=${stats.scenes_upgraded} chars=${stats.characters_upgraded} voice_remaps=${stats.voice_ids_remapped}`,
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[migrate-1.4] ERROR project=${projectId}: ${msg}`);
        errors++;
      }
    }

    console.log(
      `[migrate-1.4] Page ${page}: processed=${processed} upgraded=${cumulative.scripts_upgraded} skipped=${skipped} errors=${errors}`,
    );

    if (rows.length < PAGE_SIZE) break;
    page++;
  }

  console.log('[migrate-1.4] ——————————————————————————————————————');
  console.log(
    `[migrate-1.4] DONE: total_processed=${processed} upgraded=${cumulative.scripts_upgraded} skipped=${skipped} errors=${errors}`,
  );
  console.log(
    `[migrate-1.4] Stats: scenes=${cumulative.scenes_upgraded} characters=${cumulative.characters_upgraded} voice_ids_remapped=${cumulative.voice_ids_remapped} voice_description_dropped=${cumulative.voice_description_dropped}`,
  );

  if (isDryRun) {
    console.log('[migrate-1.4] DRY RUN complete — no rows written.');
  }

  if (errors > 0) {
    console.error(`[migrate-1.4] ${errors} projects had errors — review logs above.`);
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error('[migrate-1.4] Unhandled error:', e);
  process.exit(1);
});
