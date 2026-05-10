import { createClient } from '@supabase/supabase-js';
import { downgradeScript } from '@mango/core/llm/migration';

async function main() {
  const env = process.argv.includes('--env=production') ? 'production' : 'staging';
  const url = process.env[`SUPABASE_URL_${env.toUpperCase()}`]!;
  const key = process.env[`SUPABASE_SERVICE_ROLE_KEY_${env.toUpperCase()}`]!;
  const sb = createClient(url, key);

  console.log(`[migrate-1.3.5-inverse] env=${env}`);
  const { data: projects, error } = await sb.from('projects').select('id, script');
  if (error) throw error;

  let inversed = 0;
  for (const p of projects) {
    if (!(p.script && (p.script as any).scenes?.[0]?.first_frame_versions !== undefined)) {
      continue;  // already legacy
    }
    const legacy = downgradeScript(p.script as any);
    const { error: upErr } = await sb.from('projects').update({ script: legacy }).eq('id', p.id);
    if (upErr) throw upErr;
    inversed++;
  }
  console.log(`[migrate-1.3.5-inverse] DONE: ${inversed} reverted`);
}

main().catch((e) => { console.error(e); process.exit(1); });
