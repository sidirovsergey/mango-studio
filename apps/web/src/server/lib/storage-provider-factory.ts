import 'server-only';
import {
  FalCdnPassthroughStorage,
  SupabaseStorage,
  type StorageProvider,
} from '@mango/core';
import { getServiceRoleSupabase } from '@mango/db/server';

export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? 'fal_cdn';
  if (provider === 'supabase') {
    return new SupabaseStorage(getServiceRoleSupabase() as never, 'character-dossiers');
  }
  return new FalCdnPassthroughStorage();
}

export function getReferenceStorage(): StorageProvider {
  // user uploads всегда в Supabase, независимо от ENV
  return new SupabaseStorage(getServiceRoleSupabase() as never, 'character-references');
}
