import 'server-only';
import { getServerSupabase } from '@mango/db/server';

export async function getCurrentUser() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error(`getCurrentUser: no authenticated user (${error?.message ?? 'unknown'})`);
  }
  return data.user;
}

export async function getCurrentUserId(): Promise<string> {
  const user = await getCurrentUser();
  return user.id;
}
