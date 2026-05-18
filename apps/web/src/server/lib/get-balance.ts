import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Reads user_accounts.balance_kopeks with a defensive 0 default. Mirrors the
 * getAccountTier + getAccountMeta pattern: user_accounts is not in the
 * generated DB types yet, so we accept a generic SupabaseClient and cast the
 * row shape on usage.
 *
 * Returns 0 when row is missing OR balance_kopeks is null — never grants
 * access by accident.
 */
export async function getBalance(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from('user_accounts')
    .select('balance_kopeks')
    .eq('user_id', userId)
    .maybeSingle();
  const row = data as { balance_kopeks: number | null } | null;
  const v = row?.balance_kopeks;
  return typeof v === 'number' ? v : 0;
}
