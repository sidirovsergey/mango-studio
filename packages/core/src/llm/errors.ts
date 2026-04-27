import 'server-only';

export type LLMErrorCode =
  | 'rate_limit'
  | 'context_length'
  | 'safety_filter'
  | 'timeout'
  | 'invalid_json'
  | 'unknown';

export class LLMProviderError extends Error {
  readonly code: LLMErrorCode;
  override readonly cause: unknown;

  constructor(code: LLMErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'LLMProviderError';
    this.code = code;
    this.cause = cause;
  }
}

export function classifyLLMError(err: unknown): LLMProviderError {
  if (err instanceof LLMProviderError) return err;

  const msg = (err as { message?: string })?.message?.toLowerCase() ?? '';
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;

  if (status === 429 || msg.includes('rate limit') || msg.includes('rate_limit')) {
    return new LLMProviderError('rate_limit', 'Слишком много запросов. Подожди минутку.', err);
  }
  if (msg.includes('context length') || msg.includes('maximum context') || msg.includes('too long')) {
    return new LLMProviderError('context_length', 'Запрос слишком большой для модели.', err);
  }
  if (msg.includes('safety') || msg.includes('content_policy') || msg.includes('policy violation')) {
    return new LLMProviderError('safety_filter', 'Сработал safety-фильтр модели.', err);
  }
  if (msg.includes('timeout') || msg.includes('aborted') || (err as { name?: string })?.name === 'AbortError') {
    return new LLMProviderError('timeout', 'Модель не успела ответить.', err);
  }
  if (msg.includes('invalid json') || msg.includes('json_parse') || msg.includes('parsing error')) {
    return new LLMProviderError('invalid_json', 'Модель вернула невалидный JSON.', err);
  }
  return new LLMProviderError('unknown', (err as { message?: string })?.message ?? 'Unknown LLM error', err);
}
