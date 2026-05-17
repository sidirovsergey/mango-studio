'use server';

import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

// Supabase OTP length is configurable per project (default 6, can be raised to
// 8 or higher in Auth dashboard). Phase 1.6.0 hardcoded 6 → broke login the
// moment the dashboard was set to 8. Phase 1.6.1: accept any numeric token
// 4-10 digits and let Supabase be the final arbiter.
const InputSchema = z.object({
  email: z.string().email(),
  token: z.string().regex(/^\d{4,10}$/),
});

export type VerifyOtpResult =
  | { ok: true; user_id: string }
  | { ok: false; error: { code: string; message: string } };

export async function verifyOtpAction(
  input: z.infer<typeof InputSchema>,
): Promise<VerifyOtpResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'invalid_input', message: 'Email или код некорректны.' } };
  }
  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const anonActive = Boolean(userData.user?.is_anonymous);

  const type = anonActive ? 'email_change' : 'email';
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type,
  });
  if (error || !data.user) {
    return {
      ok: false,
      error: {
        code: (error as { code?: string } | null)?.code ?? 'unknown',
        message: error?.message ?? 'Не удалось подтвердить код.',
      },
    };
  }
  return { ok: true, user_id: data.user.id };
}
