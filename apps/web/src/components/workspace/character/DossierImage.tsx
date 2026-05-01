import { getDisplayUrl } from '@/server/lib/storage-display-url';
import type { StoredAsset } from '@mango/core';

interface Props {
  storage: StoredAsset;
  bucket: 'character-dossiers' | 'character-references';
  alt: string;
  className?: string;
}

export async function DossierImage({ storage, bucket, alt, className }: Props) {
  const url = await getDisplayUrl(storage, bucket);
  if (!url) {
    return <div className={className} aria-label={alt} data-storage-error="true" />;
  }
  return <img src={url} alt={alt} className={className} />;
}
