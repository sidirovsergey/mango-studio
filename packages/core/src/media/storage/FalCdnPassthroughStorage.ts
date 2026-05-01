// packages/core/src/media/storage/FalCdnPassthroughStorage.ts
import type { AssetContext, StorageProvider, StoredAsset } from './StorageProvider';

export class FalCdnPassthroughStorage implements StorageProvider {
  async persist(falUrl: string, _ctx: AssetContext): Promise<StoredAsset> {
    return { kind: 'fal_passthrough', url: falUrl };
  }
  async getDisplayUrl(asset: StoredAsset): Promise<string> {
    if (asset.kind === 'fal_passthrough') return asset.url;
    throw new Error(`FalCdnPassthroughStorage cannot resolve supabase asset: ${asset.path}`);
  }
}
