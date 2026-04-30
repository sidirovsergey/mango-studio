import 'server-only';
import { FalMediaProvider, type MediaProvider, type StoredAsset } from '@mango/core';
import { getDisplayUrl } from './storage-display-url';

export function getMediaProvider(): MediaProvider {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error('FAL_KEY env var missing');
  }
  return new FalMediaProvider({
    apiKey,
    resolveImageUrl: async (asset: StoredAsset) => {
      return getDisplayUrl(asset, 'character-references');
    },
  });
}
