import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AccountMeta {
  created_at: string | null;
  display_name: string | null;
}

/**
 * Reads user_accounts metadata (created_at + display_name) with a defensive
 * null fallback when the row is missing. Mirrors the getAccountTier pattern
 * — user_accounts is not in the generated DB type yet, so we accept a
 * generic SupabaseClient and cast the row shape on usage.
 */
export async function getAccountMeta(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccountMeta> {
  const { data } = await supabase
    .from('user_accounts')
    .select('created_at, display_name')
    .eq('user_id', userId)
    .maybeSingle();
  const row = data as AccountMeta | null;
  return {
    created_at: row?.created_at ?? null,
    display_name: row?.display_name ?? null,
  };
}
