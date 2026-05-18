'use server';

import { createTopupAction } from '@/app/upgrade/actions/createTopupAction';

/**
 * Phase 1.8.1 — sticky-CTA action wrappers.
 *
 * Both actions delegate to v1.7.1 createTopupAction with a binding intent.
 * For 1.8.1 MVP we use the smallest topup package (`topup_2000`) for both
 * render and studio entries. Aggregate render price for a typical
 * 6-scene economy project is ~310 ₽ — well below 2000 ₽ — so the user
 * has buffer balance left over for regens / extra renders.
 *
 * Future (1.8.3+): smart package selection — if aggregate_render_price > 2000 ₽
 * pick the next package up. For now keep dumb default; cheap to fix later.
 */

const DEFAULT_TOPUP_PACKAGE = 'topup_2000' as const;

export type IntentActionResult =
  | { ok: true; confirmation_url: string; payment_id: string; nonce?: string }
  | { ok: false; error: { code: string; message: string } };

export async function requestRenderAction(input: {
  projectId: string;
  publicSlug: string;
}): Promise<IntentActionResult> {
  return createTopupAction({
    package_code: DEFAULT_TOPUP_PACKAGE,
    intent: {
      kind: 'render',
      project_id: input.projectId,
      return_to: `/p/${input.publicSlug}`,
    },
  });
}

export async function openProStudioAction(input: {
  projectId: string;
  publicSlug: string;
}): Promise<IntentActionResult> {
  return createTopupAction({
    package_code: DEFAULT_TOPUP_PACKAGE,
    intent: {
      kind: 'studio',
      project_id: input.projectId,
      return_to: `/p/${input.publicSlug}`,
    },
  });
}
