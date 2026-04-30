export type MediaErrorCode =
  | 'rate_limit'
  | 'invalid_input'
  | 'model_unavailable'
  | 'forbidden'
  | 'timeout'
  | 'budget_exceeded'
  | 'unknown'

export class MediaProviderError extends Error {
  constructor(public code: MediaErrorCode, message: string) {
    super(message)
    this.name = 'MediaProviderError'
  }
}

export function classifyMediaError(raw: unknown): MediaErrorCode {
  if (!raw || typeof raw !== 'object') return 'unknown'
  const r = raw as { status?: number; name?: string; message?: string }
  if (r.name === 'AbortError') return 'timeout'
  if (typeof r.status === 'number') {
    if (r.status === 429) return 'rate_limit'
    if (r.status === 401 || r.status === 403) return 'forbidden'
    if (r.status === 400 || r.status === 422) return 'invalid_input'
    if (r.status === 503 || r.status === 502) return 'model_unavailable'
  }
  return 'unknown'
}
