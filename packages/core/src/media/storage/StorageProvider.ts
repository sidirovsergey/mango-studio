// packages/core/src/media/storage/StorageProvider.ts
export type StoredAsset =
  | { kind: 'fal_passthrough'; url: string }
  | { kind: 'supabase'; path: string }

export interface AssetContext {
  user_id: string
  project_id: string
  character_id: string
}

export interface StorageProvider {
  /** Persists a fal CDN URL to permanent storage (or passes through). */
  persist(falUrl: string, ctx: AssetContext): Promise<StoredAsset>

  /** Returns a display-ready URL (passthrough or signed). */
  getDisplayUrl(asset: StoredAsset): Promise<string>
}
