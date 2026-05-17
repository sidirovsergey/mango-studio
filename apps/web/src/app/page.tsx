import { BackgroundOrbs } from '@/components/effects/BackgroundOrbs';
import { Landing } from '@/components/landing/Landing';
import { getServerSupabase } from '@mango/db/server';

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
