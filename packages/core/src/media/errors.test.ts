import { describe, expect, it } from 'vitest';
import { MediaProviderError, classifyMediaError } from './errors';

describe('MediaProviderError', () => {
  it('содержит code и message', () => {
    const err = new MediaProviderError('rate_limit', 'too many');
    expect(err.code).toBe('rate_limit');
    expect(err.message).toBe('too many');
    expect(err.name).toBe('MediaProviderError');
  });
});

describe('classifyMediaError', () => {
  it('429 → rate_limit', () => {
    expect(classifyMediaError({ status: 429, message: 'rate' })).toBe('rate_limit');
  });
  it('403 → forbidden', () => {
    expect(classifyMediaError({ status: 403, message: 'Forbidden' })).toBe('forbidden');
  });
  it('401 → forbidden', () => {
    expect(classifyMediaError({ status: 401, message: 'Unauthorized' })).toBe('forbidden');
  });
  it('400 → invalid_input', () => {
    expect(classifyMediaError({ status: 400, message: 'bad input' })).toBe('invalid_input');
  });
  it('503 → model_unavailable', () => {
    expect(classifyMediaError({ status: 503, message: 'down' })).toBe('model_unavailable');
  });
  it('AbortError → timeout', () => {
    expect(classifyMediaError({ name: 'AbortError', message: 'timeout' })).toBe('timeout');
  });
  it('unknown shape → unknown', () => {
    expect(classifyMediaError({})).toBe('unknown');
    expect(classifyMediaError(null)).toBe('unknown');
    expect(classifyMediaError('string')).toBe('unknown');
  });
});
