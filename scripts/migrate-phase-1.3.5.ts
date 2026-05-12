import { upgradeScript } from '@mango/core/llm/migration';
import { ScriptGenSchema as ScriptSchema } from '@mango/core/llm/schemas';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const env = process.argv.includes('--env=production') ? 'production' : 'staging';
  const url = process.env[`SUPABASE_URL_${env.toUpperCase()}`]!;
  const key = process.env[`SUPABASE_SERVICE_ROLE_KEY_${env.toUpperCase()}`]!;
  if (!url || !key) {
    console.error(
      `Missing SUPABASE_URL_${env.toUpperCase()} or SUPABASE_SERVICE_ROLE_KEY_${env.toUpperCase()}`,
    );
    process.exit(1);
  }
  const sb = createClient(url, key);

  console.log(`[migrate-1.3.5] env=${env} — loading projects…`);
  const { data: projects, error } = await sb.from('projects').select('id, script');
  if (error) throw error;
  console.log(`[migrate-1.3.5] ${projects.length} projects`);

  let migrated = 0;
  let skipped = 0;
  for (const p of projects) {
    if (p.script && (p.script as any).scenes?.[0]?.first_frame_versions !== undefined) {
      skipped++;
      continue; // already migrated
    }
    const upgraded = upgradeScript(p.script as any);
    const validated = ScriptSchema.parse(upgraded); // throws on bad data → halt
    const { error: upErr } = await sb.from('projects').update({ script: validated }).eq('id', p.id);
    if (upErr) {
      console.error(`[migrate-1.3.5] FAIL project=${p.id}: ${upErr.message}`);
      throw upErr;
    }
    migrated++;
    if (migrated % 10 === 0) console.log(`[migrate-1.3.5] ${migrated} migrated…`);
  }
  console.log(`[migrate-1.3.5] DONE: migrated=${migrated} skipped=${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
