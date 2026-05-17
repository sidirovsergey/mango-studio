'use server';
import { getServerSupabase } from '@mango/db/server';
import { redirect } from 'next/navigation';

export async function signOutAction() {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  redirect('/');
}
