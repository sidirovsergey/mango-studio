import { describe, expect, it } from 'vitest';
import { clientIpFromRequest, isYooKassaIp } from './yookassa-ip-allowlist';

function mkReq(xff: string | null): Request {
  const headers = new Headers();
  if (xff) headers.set('x-forwarded-for', xff);
  return new Request('https://example.com', { headers });
}

describe('clientIpFromRequest', () => {
  it('returns null for missing XFF', () => {
    expect(clientIpFromRequest(mkReq(null))).toBeNull();
  });

  it('returns null for empty XFF', () => {
    expect(clientIpFromRequest(mkReq(''))).toBeNull();
  });

  it('extracts IPv4 plain (first hop)', () => {
    expect(clientIpFromRequest(mkReq('185.71.76.10, 1.2.3.4'))).toBe('185.71.76.10');
  });

  it('strips IPv4 port', () => {
    expect(clientIpFromRequest(mkReq('185.71.76.10:443, 1.2.3.4'))).toBe('185.71.76.10');
  });

  it('strips IPv6 brackets + port', () => {
    expect(clientIpFromRequest(mkReq('[2a02:5180::1]:443'))).toBe('2a02:5180::1');
  });

  it('preserves IPv6 plain (no port, multiple colons)', () => {
    expect(clientIpFromRequest(mkReq('2a02:5180::1'))).toBe('2a02:5180::1');
    expect(clientIpFromRequest(mkReq('2a02:5180:0:0::1'))).toBe('2a02:5180:0:0::1');
  });

  it('handles single-hop XFF (no comma)', () => {
    expect(clientIpFromRequest(mkReq('185.71.76.10'))).toBe('185.71.76.10');
  });
});

describe('isYooKassaIp', () => {
  it('accepts known ЮKassa IPv4 ranges', () => {
    expect(isYooKassaIp('185.71.76.10')).toBe(true);
    expect(isYooKassaIp('77.75.153.99')).toBe(true);
    expect(isYooKassaIp('77.75.154.200')).toBe(true);
  });

  it('rejects unrelated IPv4', () => {
    expect(isYooKassaIp('8.8.8.8')).toBe(false);
    expect(isYooKassaIp('1.1.1.1')).toBe(false);
  });

  it('accepts known ЮKassa IPv6 range', () => {
    expect(isYooKassaIp('2a02:5180::1')).toBe(true);
    expect(isYooKassaIp('2a02:5180:abcd:1234::')).toBe(true);
  });

  it('rejects unrelated IPv6', () => {
    expect(isYooKassaIp('2001:db8::1')).toBe(false);
  });

  it('rejects garbage / null', () => {
    expect(isYooKassaIp('not-an-ip')).toBe(false);
    expect(isYooKassaIp(null)).toBe(false);
    expect(isYooKassaIp('')).toBe(false);
  });
});
