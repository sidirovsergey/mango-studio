import { getCurrentUser } from '@/lib/auth/get-user';
import { SCENE_ASSETS_BUCKET } from '@/server/lib/storage-paths';
import { getServerSupabase } from '@mango/db/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/scene-asset?path=<user_id>/<project_id>/<scene_id>/<filename>
 *
 * Signed-URL proxy for assets in the `scene-assets` bucket. The workspace's
 * `SceneThumbnailColumn` references this URL pattern for any version whose
 * `storage.kind === 'supabase'`. Without this route the browser receives
 * 404 and the `<img>` falls back to a broken-image style (orange gradient).
 *
 * This route was assumed but never implemented since Phase 1.3.5 introduced
 * the async fal CDN → Supabase Storage mirror. The bug stayed latent because
 * users typically viewed assets within the ~10s mirror window where the
 * jsonb storage descriptor still held the working fal_passthrough URL.
 * PR #51 (sync-reconcile) made the broken state widely visible: CJM
 * projects always end up with mirrored storage by the time the user reaches
 * the workspace.
 *
 * SECURITY MODEL
 * --------------
 * The bucket is private. We sign URLs via the user-session client (anon
 * key + cookies). The bucket's RLS policy on `storage.objects` restricts
 * each user to objects under their own auth.uid() folder (the path
 * convention is `<user_id>/<project_id>/...`), so the signing call itself
 * is the access check.
 *
 * Defense in depth:
 *   - Strict path-shape validation rejects traversal (../) and absolute paths.
 *   - Authenticated session required; anon-without-session → 401.
 *   - User-session signing, not service_role.
 *
 * CACHE
 * -----
 * Successful 302 responses use `Cache-Control: private, max-age=3300` (just
 * under the 1-hour signed URL TTL) so the browser doesn't re-roundtrip on
 * every page render. 4xx/5xx responses use `no-store` so transient errors
 * don't get pinned (per Codex audit nit).
 *
 * Scope: ONLY serves the `scene-assets` bucket. Character dossiers and
 * references live in separate buckets and have their own server-rendered
 * `DossierImage` / `getDisplayUrl` resolution path — they do NOT route
 * through here. Renaming this endpoint to a generic `/api/storage-asset`
 * was considered but deferred to keep the blast radius small.
 */

// Path shape: <uuid>/<uuid>/<scene_id>/<filename>
// - 36-char UUIDs for user_id + project_id (case-insensitive v4 shape).
// - scene_id is whatever the script uses (e.g. `s1`, `scene-01`); we accept
//   any non-empty token without `/` or `..`.
// - filename: non-empty, no traversal, no `..`.
//
// Multi-line for readability; anchored with ^ and $ for safety.
const PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[^/.\s]+(?:[-_.][^/.\s]+)*\/[^/]+$/i;

function noStore(body: { error: string }, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(req: Request): Promise<NextResponse | Response> {
  const url = new URL(req.url);
  const path = url.searchParams.get('path');

  if (!path) {
    return noStore({ error: 'missing path' }, 400);
  }

  // Reject obvious traversal. The regex below covers shape, but explicit
  // checks here make the failure mode unambiguous and avoid regex backtracking.
  if (path.includes('..') || path.startsWith('/')) {
    return noStore({ error: 'invalid path' }, 400);
  }

  if (!PATH_RE.test(path)) {
    return noStore({ error: 'invalid path' }, 400);
  }

  let user: { id: string };
  try {
    user = await getCurrentUser();
  } catch {
    return noStore({ error: 'unauthorized' }, 401);
  }

  // Extract the user_id segment from the path; assert it matches the caller.
  // The bucket RLS would refuse anyway, but failing here gives a cleaner
  // error and avoids a wasted round-trip to storage.
  const pathUserId = path.split('/')[0];
  if (!pathUserId || pathUserId.toLowerCase() !== user.id.toLowerCase()) {
    return noStore({ error: 'forbidden' }, 403);
  }

  const sb = await getServerSupabase();
  const { data, error } = await sb.storage.from(SCENE_ASSETS_BUCKET).createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    // RLS denial, missing object, network blip — all look the same from
    // the client side. Log path + bucket + user for ops triage; the
    // signed URL itself is NEVER logged (it's a short-lived credential).
    // Path leaks bucket folder structure but no actual content; acceptable
    // given the prefix already encodes user_id (which we also log here).
    console.warn('[api/scene-asset] sign failed', {
      bucket: SCENE_ASSETS_BUCKET,
      path,
      user_id: user.id,
      error: error?.message,
    });
    return noStore({ error: 'not found' }, 404);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: data.signedUrl,
      'Cache-Control': 'private, max-age=3300',
    },
  });
}
