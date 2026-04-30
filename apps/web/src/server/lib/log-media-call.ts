import 'server-only';
import { getServiceRoleSupabase } from '@mango/db/server';
import type { Database } from '@mango/db';
import type { MediaErrorCode } from '@mango/core';

type MediaCallInsert = Database['public']['Tables']['media_calls']['Insert'];

export interface MediaCallLogInput {
  user_id: string;
  project_id: string | null;
  model: string;
  method: 'generateCharacterDossier' | 'refineCharacter' | 'generateReferenceImage';
  character_id?: string | null;
  cost_usd?: number | null;
  latency_ms?: number | null;
  fal_request_id?: string | null;
  status: 'ok' | 'error';
  error_code?: MediaErrorCode | null;
}

export async function logMediaCall(input: MediaCallLogInput): Promise<void> {
  const admin = getServiceRoleSupabase();
  const row: MediaCallInsert = {
    user_id: input.user_id,
    project_id: input.project_id,
    model: input.model,
    method: input.method,
    character_id: input.character_id ?? null,
    cost_usd: input.cost_usd ?? null,
    latency_ms: input.latency_ms ?? null,
    fal_request_id: input.fal_request_id ?? null,
    status: input.status,
    error_code: input.error_code ?? null,
  };
  const { error } = await admin.from('media_calls').insert(row);
  if (error) {
    console.error('[logMediaCall] failed', error, input);
  }
}
