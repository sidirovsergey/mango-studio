import { ProfileCard } from '@/components/account/ProfileCard';
import { getAccountMeta } from '@/server/lib/get-account-meta';
import { getAccountTier } from '@/server/lib/get-account-tier';
import { getBalance } from '@/server/lib/get-balance';
import { getServerSupabase } from '@mango/db/server';
import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  // Master switch — when auth UI is off, /profile hides entirely (matches
  // /login). Returns 404 so the page is not discoverable in disabled mode.
  if (process.env.NEXT_PUBLIC_AUTH_UI_ENABLED !== 'true') {
    notFound();
  }

  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  // Redirect (not 404) for anon/unauthed — this is an email-account surface,
  // and a redirect is gentler than pretending the route doesn't exist.
  if (!user || user.is_anonymous || !user.email) {
    redirect('/login');
  }

  // Parallel server-side reads — all scoped to the current user (RLS-enforced
  // on user_accounts + projects + media_jobs).
  const [tier, meta, projectCountResult, balanceKopeks] = await Promise.all([
    getAccountTier(supabase, user.id),
    getAccountMeta(supabase, user.id),
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    getBalance(supabase, user.id),
  ]);

  const projectCount = projectCountResult.count ?? 0;
  // Defensive fallback: if user_accounts row is missing (trigger glitch),
  // use the auth.users created_at — never crash.
  const createdAt = meta.created_at ?? user.created_at ?? null;
  const displayName = meta.display_name;

  return (
    <ProfileCard
      email={user.email}
      displayName={displayName}
      tier={tier}
      createdAt={createdAt}
      projectCount={projectCount}
      balanceKopeks={balanceKopeks}
    />
  );
}
