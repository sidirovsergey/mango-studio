// packages/core/src/media/storage/SupabaseStorage.ts
import type { StorageProvider, StoredAsset, AssetContext } from './StorageProvider'

interface SupabaseClientLike {
  storage: {
    from(bucket: string): {
      upload(path: string, body: ArrayBuffer | Blob, opts?: { contentType?: string; cacheControl?: string }): Promise<{ data: { path: string } | null; error: unknown }>
      createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: unknown }>
    }
  }
}

export interface SupabaseStorageOptions {
  fetchImpl?: typeof fetch
  signedUrlTtlSec?: number
}

export class SupabaseStorage implements StorageProvider {
  private fetchImpl: typeof fetch
  private signedUrlTtlSec: number

  constructor(
    private client: SupabaseClientLike,
    private bucket: string,
    opts: SupabaseStorageOptions = {}
  ) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch
    this.signedUrlTtlSec = opts.signedUrlTtlSec ?? 3600
  }

  async persist(falUrl: string, ctx: AssetContext): Promise<StoredAsset> {
    const resp = await this.fetchImpl(falUrl)
    if (!resp.ok) throw new Error(`fetch fal asset failed: ${resp.status}`)
    const buf = await resp.arrayBuffer()
    const ct = resp.headers.get('content-type') ?? 'image/png'
    const ext = ct.split('/').pop()?.split(';')[0] ?? 'png'
    const generationId = crypto.randomUUID()
    const path = `${ctx.user_id}/${ctx.project_id}/${ctx.character_id}/${generationId}.${ext}`

    const { data, error } = await this.client.storage.from(this.bucket).upload(path, buf, {
      contentType: ct,
      cacheControl: '31536000',
    })
    if (error) throw new Error(`supabase upload failed: ${JSON.stringify(error)}`)
    if (!data) throw new Error('supabase upload returned no data')

    return { kind: 'supabase', path }
  }

  async getDisplayUrl(asset: StoredAsset): Promise<string> {
    if (asset.kind === 'fal_passthrough') return asset.url
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(asset.path, this.signedUrlTtlSec)
    if (error || !data) throw new Error(`signed URL failed: ${JSON.stringify(error)}`)
    return data.signedUrl
  }
}
