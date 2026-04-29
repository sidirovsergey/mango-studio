import type { Database } from '@mango/db/types';
import { type CookieOptions, createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => {
          for (const { name, value, options } of cookies) {
            response.cookies.set({ name, value, ...options });
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('[middleware] signInAnonymously failed:', error.message);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/data|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.(?:json|webmanifest)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|api/webhooks).*)',
  ],
};
