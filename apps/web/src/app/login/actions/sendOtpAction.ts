'use server';

import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({ email: z.string().email() });

export type SendOtpResult =
  | { ok: true }
  | { ok: false; error: { code: string; message: string } };

export async function sendOtpAction(input: z.infer<typeof InputSchema>): Promise<SendOtpResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'invalid_email', message: 'Введите корректный email.' } };
  }
  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const anonActive = Boolean(userData.user?.is_anonymous);

  if (anonActive) {
    const { error } = await supabase.auth.updateUser({ email: parsed.data.email });
    if (error)
      return {
        ok: false,
        error: { code: (error as { code?: string }).code ?? 'unknown', message: error.message },
      };
    return { ok: true };
  }

  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data.email });
  if (error)
    return {
      ok: false,
      error: { code: (error as { code?: string }).code ?? 'unknown', message: error.message },
    };
  return { ok: true };
}
