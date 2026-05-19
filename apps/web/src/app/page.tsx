import { BackgroundOrbs } from '@/components/effects/BackgroundOrbs';
import { Landing } from '@/components/landing/Landing';
import { getServerSupabase } from '@mango/db/server';

/**
 * Phase 1.8.2 — extend Vercel function maxDuration so the Server Action
 * (`createProjectFromIdeaAction`) + its `next/server.after()` callback
 * (script gen + first-frame batch, ~60-180s wall time) doesn't get
 * killed by the platform-default 60s timeout.
 *
 * Codex pre-PR audit (2026-05-19) findings #1: after() runs within the
 * route segment's lifetime; if the function terminates, after()
 * callbacks are killed mid-batch leaving status='generating_storyboard'
 * forever. 300s is Vercel's Pro-plan cap.
 */
export const maxDuration = 300;

export default async function HomePage() {
  // Read the current user server-side so the landing corner can render an
  // auth-aware widget. Anonymous middleware always provides SOME user, so
  // `userData.user` is effectively never null in practice — but we handle
  // the empty case defensively.
  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  return (
    <>
      <BackgroundOrbs />
      <Landing userEmail={user?.email ?? null} isAnonymous={Boolean(user?.is_anonymous)} />
    </>
  );
}
