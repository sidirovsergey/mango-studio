import { getDisplayUrl } from '@/server/lib/storage-display-url';
import type { StoredAsset } from '@mango/core';

interface Props {
  storage: StoredAsset;
  bucket: 'character-dossiers' | 'character-references';
  alt: string;
  className?: string;
  faceCrop?: boolean;
}

export async function DossierImage({ storage, bucket, alt, className, faceCrop }: Props) {
  const url = await getDisplayUrl(storage, bucket);
  if (!url) {
    return <div className={className} aria-label={alt} data-storage-error="true" />;
  }
  const style = faceCrop
    ? { objectFit: 'cover' as const, objectPosition: 'center 25%' }
    : undefined;
  return <img src={url} alt={alt} className={className} style={style} />;
}
