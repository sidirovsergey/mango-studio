import 'server-only';
import type { StoredAsset } from '@mango/core';
import { getServiceRoleSupabase } from '@mango/db/server';

export async function getDisplayUrl(
  asset: StoredAsset,
  bucket: 'character-dossiers' | 'character-references',
): Promise<string> {
  if (asset.kind === 'fal_passthrough') return asset.url;
  const admin = getServiceRoleSupabase();
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(asset.path, 3600);
  if (error || !data) {
    console.error('[getDisplayUrl] signed URL failed', error);
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
