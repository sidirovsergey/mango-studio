import { getDisplayUrl } from '@/server/lib/storage-display-url';
import type { StoredAsset } from '@mango/core';

interface Props {
  storage: StoredAsset;
  bucket: 'character-dossiers' | 'character-references';
  alt: string;
  className?: string;
  /** Phase 1.2.6 fix-6: cache-bust query param чтобы браузер не показывал
   * закешированный response при regen (имена fal CDN files уникальные, но
   * browser cache может зацепиться за `<img>` element с тем же URL что был
   * до регенерации, если React reconciliation не сработала). */
  cacheBust?: string;
}

export async function DossierImage({ storage, bucket, alt, className, cacheBust }: Props) {
  const baseUrl = await getDisplayUrl(storage, bucket);
  if (!baseUrl) {
    return <div className={className} aria-label={alt} data-storage-error="true" />;
  }
  const url = cacheBust
    ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheBust)}`
    : baseUrl;
  return <img src={url} alt={alt} className={className} />;
}
