import 'server-only';
import { type CookieOptions, createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './types';

export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) =>
          toSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // ignore — happens in static generation context
            }
          }),
      },
    },
  );
}

export function getServiceRoleSupabase() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}
