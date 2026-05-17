import 'server-only';
import type { AccountTier } from '@mango/core';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Reads user_accounts.tier with a defensive 'trial' default.
 *
 * Why defensive: if the row is missing (trigger glitch, race with a
 * freshly-provisioned anon user, etc.), treat as trial — never grant
 * capability by accident. The provisioning trigger
 * (tg_user_accounts_provision_on_auth_users_insert) makes a missing row
 * theoretically impossible, but defense-in-depth.
 */
export async function getAccountTier(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccountTier> {
  const { data } = await supabase
    .from('user_accounts')
    .select('tier')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.tier as AccountTier | undefined) ?? 'trial';
}
