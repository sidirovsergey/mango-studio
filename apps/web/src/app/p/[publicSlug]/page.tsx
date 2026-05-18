import { enqueueRenderForProject } from '@/server/lib/enqueue-render';
import { fetchPublicProjectBySlug } from '@/server/lib/public-project-view';
import { getServerSupabase } from '@mango/db/server';
import { notFound } from 'next/navigation';
import { IntentCanceledView } from './components/IntentCanceledView';
import { IntentExpiredView } from './components/IntentExpiredView';
import { PaymentPendingView } from './components/PaymentPendingView';
import { PublicStoryboardView } from './components/PublicStoryboardView';
import { RenderProgressView } from './components/RenderProgressView';

/**
 * Phase 1.8.1 — public storyboard view.
 *
 * Two modes:
 * - Without `?nonce=`: render the public storyboard via fetchPublicProjectBySlug
 *   (service_role bypass; allowlisted via toPublicProjectView). User can be
 *   anon or another logged-in user; the page is intentionally public.
 *
 * - With `?nonce=`: 1.7.1 intent resolution flow (PaymentPendingView,
 *   RenderProgressView, IntentExpiredView, IntentCanceledView). Used after
 *   ЮKassa redirect.
 *
 * Routing model: [publicSlug] is the short URL-safe id (10 chars) from
 * projects.public_slug. Direct shareable URL.
 */
type IntentInspectRow = {
  intent_id: string;
  project_id: string;
  kind: 'render' | 'studio' | 'topup_only';
  return_to: string;
  intent_status: 'pending' | 'paid' | 'consumed' | 'expired' | 'canceled';
  payment_status: 'pending' | 'succeeded' | 'canceled' | 'failed' | 'refunded' | null;
  expires_at: string;
};

export default async function PublicSlugPage(props: {
  params: Promise<{ publicSlug: string }>;
  searchParams: Promise<{ nonce?: string }>;
}) {
  const { publicSlug } = await props.params;
  const { nonce } = await props.searchParams;

  if (!nonce) {
    // Phase 1.8.1: full public storyboard render. Slug → project lookup via
    // service_role + allowlisted mapper.
    const view = await fetchPublicProjectBySlug(publicSlug);
    if (!view) {
      notFound();
    }
    return <PublicStoryboardView project={view} />;
  }

  const sb = await getServerSupabase();
  const rpc = sb.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: IntentInspectRow[] | null; error: { message: string } | null }>;
  const inspect = await rpc('fn_inspect_intent', { p_nonce: nonce });

  if (inspect.error || !inspect.data || inspect.data.length === 0) {
    // Nonce not found OR user_id mismatch (RLS filters by auth.uid).
    // Show a generic 404 — don't disclose existence of the nonce.
    notFound();
  }

  const row = inspect.data[0] as IntentInspectRow;

  // Pending payment — webhook hasn't credited yet. Realtime poller in the
  // client component flips the UI when intent_status transitions to 'paid'.
  if (row.intent_status === 'pending' || row.payment_status !== 'succeeded') {
    return <PaymentPendingView intentId={row.intent_id} publicSlug={publicSlug} />;
  }

  // Paid but not yet consumed — trigger enqueue. Synchronous to ensure the
  // user lands on a progress view with reserved jobs visible.
  if (row.intent_status === 'paid') {
    const result = await enqueueRenderForProject({
      intent_id: row.intent_id,
      project_id: row.project_id,
    });
    return (
      <RenderProgressView
        projectId={row.project_id}
        sceneJobIds={result.scene_job_ids}
        masterJobId={result.master_job_id}
        partialError={
          result.ok ? null : { sceneErrors: result.scene_errors, masterError: result.master_error }
        }
      />
    );
  }

  // Already consumed (user refresh or earlier landing).
  if (row.intent_status === 'consumed') {
    return (
      <RenderProgressView
        projectId={row.project_id}
        sceneJobIds={[]}
        masterJobId={undefined}
        partialError={null}
      />
    );
  }

  if (row.intent_status === 'expired') {
    return <IntentExpiredView projectId={row.project_id} />;
  }

  // canceled
  return <IntentCanceledView projectId={row.project_id} />;
}
