import { describe, expect, it } from 'vitest';
import { redactSensitiveQuery } from './log-redact';

describe('redactSensitiveQuery', () => {
  it('redacts nonce param', () => {
    expect(redactSensitiveQuery('https://m.ru/p/abc?nonce=secret')).toBe(
      'https://m.ru/p/abc?nonce=%5BREDACTED%5D',
    );
  });

  it('preserves other params', () => {
    const r = redactSensitiveQuery('https://m.ru/p/abc?foo=bar&nonce=secret&baz=qux');
    expect(r).toContain('foo=bar');
    expect(r).toContain('baz=qux');
    expect(r).not.toContain('secret');
  });

  it('returns unchanged URL when no sensitive params', () => {
    expect(redactSensitiveQuery('https://m.ru/p/abc?foo=bar')).toBe('https://m.ru/p/abc?foo=bar');
  });

  it('handles relative paths AND preserves shape (Codex audit E #4)', () => {
    const r = redactSensitiveQuery('/p/abc?nonce=secret');
    expect(r).toContain('nonce=%5BREDACTED%5D');
    expect(r).toBe('/p/abc?nonce=%5BREDACTED%5D');
    // Specifically: no http://localhost prefix injected.
    expect(r).not.toContain('http://');
    expect(r).not.toContain('localhost');
  });

  it('absolute URL stays absolute', () => {
    const r = redactSensitiveQuery('https://m.ru/p/abc?nonce=secret');
    expect(r.startsWith('https://m.ru/')).toBe(true);
  });

  it('returns input as-is when URL parse fails', () => {
    // garbage string that can't be parsed under either constructor signature
    expect(redactSensitiveQuery('not a url with spaces and nonce=secret')).toBe(
      'not a url with spaces and nonce=secret',
    );
  });

  it('handles URL with no query string', () => {
    expect(redactSensitiveQuery('https://m.ru/p/abc')).toBe('https://m.ru/p/abc');
  });

  it('redacts even when nonce appears multiple times (first wins via searchParams.set)', () => {
    const r = redactSensitiveQuery('https://m.ru/p/abc?nonce=a&nonce=b');
    expect(r).not.toContain('nonce=a');
    expect(r).not.toContain('nonce=b');
    expect(r).toContain('nonce=%5BREDACTED%5D');
  });
});
