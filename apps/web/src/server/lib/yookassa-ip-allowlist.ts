import 'server-only';
import * as ipaddr from 'ipaddr.js';

/**
 * ЮKassa published webhook IP ranges as of 2026-05.
 * Source: https://yookassa.ru/developers/using-api/webhooks#ip
 *
 * Hard-coded list to keep the webhook handler self-contained (no network
 * fetch at boot). Re-verify these annually or whenever ЮKassa announces
 * a change.
 */
const ALLOWED_CIDRS = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.154.128/25',
  '2a02:5180::/32',
];

/**
 * Extracts the client IP from the x-forwarded-for header. Handles all 4
 * Vercel XFF formats (Codex SHOULD-FIX #4):
 *   - IPv4 plain: "1.2.3.4"
 *   - IPv4 with port: "1.2.3.4:5678" → strip port
 *   - IPv6 plain: "2a02:5180::1" → preserve (multiple colons → no port)
 *   - IPv6 bracketed: "[2a02:5180::1]:443" → strip brackets + port
 *
 * Returns null when no XFF header is present.
 */
export function clientIpFromRequest(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  const first = xff.split(',')[0]?.trim();
  if (!first) return null;

  // IPv6 bracketed: "[addr]:port"
  if (first.startsWith('[')) {
    const end = first.indexOf(']');
    return end > 1 ? first.slice(1, end) : null;
  }

  const colons = (first.match(/:/g) ?? []).length;
  // Multiple colons → IPv6 plain (no port — IPv6 ports require brackets)
  if (colons > 1) return first;
  // Exactly one colon → IPv4:port → strip
  if (colons === 1) return first.split(':')[0] ?? first;
  // No colons → IPv4 plain
  return first;
}

/**
 * Returns true iff the IP belongs to one of the ЮKassa allowlist CIDRs.
 * Returns false for null, empty, malformed addresses, or addresses outside
 * all known ranges.
 */
export function isYooKassaIp(ip: string | null): boolean {
  if (!ip) return false;
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(ip);
  } catch {
    return false;
  }
  for (const cidr of ALLOWED_CIDRS) {
    const [range, prefixStr] = cidr.split('/');
    if (!range || !prefixStr) continue;
    let rangeParsed: ipaddr.IPv4 | ipaddr.IPv6;
    try {
      rangeParsed = ipaddr.parse(range);
    } catch {
      continue;
    }
    if (parsed.kind() !== rangeParsed.kind()) continue;
    const prefix = Number.parseInt(prefixStr, 10);
    if ((parsed as ipaddr.IPv4 | ipaddr.IPv6).match(rangeParsed as never, prefix)) {
      return true;
    }
  }
  return false;
}
