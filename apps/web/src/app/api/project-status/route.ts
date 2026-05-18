import { fetchPublicProjectStatusBySlug } from '@/server/lib/public-project-view';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Phase 1.8.2 — lightweight project-status poller endpoint for LoadingView.
 *
 * Returns a minimal JSON envelope so the loading view can decide whether
 * to reload (status flipped off generating) or keep polling. Same anti-
 * enumeration semantics as /p/[slug] — `null` for not-found indistinguishable
 * from "not yet inserted".
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ ok: false, error: 'missing slug' }, { status: 400 });
  }
  const probe = await fetchPublicProjectStatusBySlug(slug);
  if (!probe) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(
    {
      ok: true,
      status: probe.status,
      is_generating: probe.is_generating,
      is_share_ready: probe.is_share_ready,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
