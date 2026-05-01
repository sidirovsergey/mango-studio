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
  // Model-sheet dossier puts the first full-body pose in the upper-left
  // region of a widescreen image. Cropping to ~12.5% × 30% of the image
  // surface (object-position upper-left + scale-up) zooms into that pose's
  // face for the avatar. Scale 2.6 was tuned visually against nano-banana
  // output; if dossier composition changes, retune.
  const style: React.CSSProperties | undefined = faceCrop
    ? {
        objectFit: 'cover',
        objectPosition: '12% 18%',
        transform: 'scale(2.6)',
        transformOrigin: '12% 18%',
      }
    : undefined;
  return <img src={url} alt={alt} className={className} style={style} />;
}
