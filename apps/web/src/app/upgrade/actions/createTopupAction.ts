'use server';

import { type CreateTopupResult, createTopupForAuthedUser } from '@/server/lib/topup-core';
import { TopupInputSchema } from '@mango/core/billing';
import { getServerSupabase } from '@mango/db/server';
import { redirect } from 'next/navigation';

export type { CreateTopupResult };

/**
 * Phase 1.7.1 entry point — kept for /upgrade page + TopupCard callers
 * + Phase 1.8.1 sticky-CTA intent-actions wrappers.
 *
 * Phase 1.8.3 Sub-phase B refactor: the auth check + redirect stay HERE,
 * but the post-auth ledger/ЮKassa flow has moved to
 * `createTopupForAuthedUser` in `@/server/lib/topup-core`. That helper
 * never redirects, so `verifyOtpAction` (Phase 1.8.3 Sub-phase D) can
 * call it directly with the just-verified session — bypassing the
 * unproven-in-Next-15 same-request cookie visibility issue that would
 * have made a nested `createTopupAction` call re-throw the redirect.
 *
 * External contract preserved: same input shape, same CreateTopupResult.
 */
export async function createTopupAction(input: unknown): Promise<CreateTopupResult> {
  const parsed = TopupInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'invalid_package', message: 'Неверный пакет.' } };
  }

  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user || user.is_anonymous || !user.email) {
    redirect('/login');
  }

  return createTopupForAuthedUser({
    supabase,
    user: { id: user.id, email: user.email },
    input: parsed.data,
  });
}
