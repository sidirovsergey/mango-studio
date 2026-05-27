import 'server-only';
import type { StoredAsset } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';

/**
 * Build a 1-hour signed URL for a Supabase-stored asset, or pass through
 * the fal CDN URL.
 *
 * Uses the user-session client (anon key + cookies) rather than the
 * service-role admin client so we don't depend on SUPABASE_SERVICE_ROLE_KEY
 * being present in every environment. RLS on storage.objects already
 * restricts each user to their own folder (foldername[1] = auth.uid()),
 * so the user-session client can sign URLs for their own assets.
 */
export async function getDisplayUrl(
  asset: StoredAsset,
  bucket: 'character-dossiers' | 'character-references',
): Promise<string> {
  if (asset.kind === 'fal_passthrough') return asset.url;
  // Phase 1.3.5+ bucketed scene assets carry their own bucket (validated by
  // SceneAssetVersionSchema with default 'scene-assets'). Prefer it over the
  // positional argument. Legacy character assets (DossierSchema's StoredAsset
  // variant has no bucket field) fall back to the positional argument as
  // before. Closes the 2026-05-27 Stage-04 outage where scene-assets paths
  // were signed through 'character-references' → 404 → image_url='' → fal
  // 422 on video submit.
  const targetBucket =
    'bucket' in asset &&
    typeof (asset as { bucket?: unknown }).bucket === 'string' &&
    (asset as { bucket: string }).bucket
      ? (asset as { bucket: string }).bucket
      : bucket;
  const sb = await getServerSupabase();
  const { data, error } = await sb.storage
    .from(targetBucket)
    .createSignedUrl(asset.path, 3600);
  if (error || !data) {
    console.error('[getDisplayUrl] signed URL failed', {
      bucket: targetBucket,
      path: asset.path,
      error,
    });
    return '';
  }
  return data.signedUrl;
}

/** Batch helper для массива assets. */
export async function getDisplayUrls(
  assets: StoredAsset[],
  bucket: 'character-dossiers' | 'character-references',
): Promise<string[]> {
  return Promise.all(assets.map((a) => getDisplayUrl(a, bucket)));
}
