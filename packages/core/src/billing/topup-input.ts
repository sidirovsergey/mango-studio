import { z } from 'zod';

/**
 * Phase 1.7.1 — TopupInput shared schema.
 *
 * v1.7.0 callers passed `{ package_code }` only. v1.7.1 callers MAY also
 * pass `intent` to bind the top-up to a render or studio entry on a
 * specific project. After payment succeeds, the ЮKassa webhook settles the
 * intent (status pending|expired → paid) and the `/p/[slug]?nonce=X` page
 * dispatches the actual render via enqueueRenderForProject — webhook does
 * NOT auto-enqueue itself (15s timeout + auth context constraints).
 *
 * Backward compatibility: `intent` defaults to `{ kind: 'topup_only' }`,
 * which means no `billing_intents` row is created and the behavior is
 * identical to v1.7.0.
 */

export const TopupPackageCodeSchema = z.enum(['topup_2000', 'topup_5000', 'topup_10000']);
export type TopupPackageCode = z.infer<typeof TopupPackageCodeSchema>;

/**
 * Kopeks per package — single source of truth (mirrors server-action constant
 * pre-1.7.1 but exported now so /upgrade UI + createTopupAction never drift).
 */
export const TOPUP_PACKAGE_KOPEKS: Record<TopupPackageCode, number> = {
  topup_2000: 200_000,
  topup_5000: 500_000,
  topup_10000: 1_000_000,
};

/**
 * `return_to` MUST be a same-origin path. We reject absolute URLs to defeat
 * open-redirect attacks where an attacker crafts a topup link whose
 * ЮKassa-redirect lands the user on attacker.example/phish.
 */
const SamePathSchema = z
  .string()
  .min(1)
  .max(512)
  .startsWith('/', { message: 'return_to must be same-origin path' })
  .refine((s) => !s.startsWith('//'), { message: 'return_to must not be protocol-relative' });

export const TopupIntentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('render'),
    project_id: z.string().uuid(),
    return_to: SamePathSchema,
  }),
  z.object({
    kind: z.literal('studio'),
    project_id: z.string().uuid(),
    return_to: SamePathSchema,
  }),
  z.object({
    kind: z.literal('topup_only'),
  }),
]);
export type TopupIntent = z.infer<typeof TopupIntentSchema>;

export const TopupInputSchema = z.object({
  package_code: TopupPackageCodeSchema,
  intent: TopupIntentSchema.optional().default({ kind: 'topup_only' }),
});
export type TopupInput = z.infer<typeof TopupInputSchema>;
