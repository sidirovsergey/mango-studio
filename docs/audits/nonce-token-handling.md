# Phase 1.7.1 — Nonce token handling

**Date:** 2026-05-18
**Scope:** Bearer-token (nonce) lifecycle in the `/p/[publicSlug]?nonce=X`
intent resolution flow.

## Threat model

The nonce is a 16-char base64url random string (~95 bits entropy) bound to
a `billing_intents` row. Anyone holding a valid (nonce, user JWT) pair can
inspect the bound intent via `fn_inspect_intent` and trigger render
dispatch if the intent is `paid`.

**RLS guard:** `fn_inspect_intent` filters `WHERE bi.user_id = auth.uid()`
inside a `SECURITY DEFINER` function. A stolen nonce used by a different
logged-in user returns zero rows → page renders `notFound()`. The nonce is
NOT a stand-alone credential; both nonce AND user session must match.

## Leakage surfaces

| Surface | Risk | Mitigation |
|---|---|---|
| **Browser history** | Nonce persists in URL bar history; another user on the same machine + same browser profile + still-logged-in account could open it before TTL expiry | TTL = 1 hour. After expiry the nonce is dead. Multi-user-shared devices are out of scope for v1.7.1 (operator can document for Phase 1.8.x) |
| **Referer header** | Outbound links from `/p/[slug]?nonce=X` would normally leak the URL to the destination | **Middleware sets `Referrer-Policy: no-referrer` on /p/* routes** (see `src/middleware.ts`). This applies to ALL outbound navigation from the page, including embedded image loads, fetches, link clicks |
| **Vercel function logs** | `console.log({ url: req.url })` would persist the nonce indefinitely in operator-readable logs | **`redactSensitiveQuery(url)` helper in `src/server/lib/log-redact.ts`** — wrap any `req.url` log with this. Operator MUST use it in all custom loggers. (No custom logger is currently active in 1.7.1 — Next.js default access log obeys `Referrer-Policy` for incoming logging but the request URL itself is still recorded; see below) |
| **Reverse-proxy access logs (Vercel)** | Vercel's internal access log captures `request.url` in full incl. query string. Operator does NOT have a knob to redact this in 1.7.1 | **Accept residual risk.** Mitigation: TTL = 1 hour limits the blast radius; RLS prevents cross-user redemption. If audit/SOC2 requires zero-leak: route the nonce via POST body + session token exchange (significant rework, defer to Phase 1.8.x) |
| **Analytics (Vercel Analytics, GA, etc.)** | Page view events would include the full URL | Vercel Analytics: operator must configure URL anonymisation in dashboard. GA: not installed in 1.7.1 |
| **Browser extensions / network sniffers** | Out of scope (user-trust boundary) |  |
| **Shared screen / streaming** | Out of scope (user-trust boundary) |  |

## Operator F-task

Before declaring v1.7.1 shipped:

1. Verify `Referrer-Policy: no-referrer` is being set on `/p/*` responses
   (curl `/p/test-slug?nonce=fake` and inspect headers).
2. Configure Vercel Analytics URL anonymisation (Dashboard → Project →
   Analytics → Settings → URL anonymisation).
3. Confirm no custom logger persists `req.url` without `redactSensitiveQuery`.
4. Document: nonces with TTL 1h, ownership via RLS, no rotation needed.

## Future hardening (Phase 1.8.x+)

- **POST-only redemption.** Replace `?nonce=X` GET with a one-time POST
  endpoint that exchanges the nonce for a server-side session token.
  Removes nonce from URL entirely.
- **Per-IP rate limit.** Cap `/p/[slug]?nonce=` reads to e.g. 10/min/IP
  to defeat brute-force enumeration.
- **HMAC signing.** Wrap nonce in `HMAC(server_secret, intent_id || expiry)`
  so a server-side compromise of `billing_intents.nonce` alone doesn't
  yield usable bearers without the HMAC key.

None of these are required for v1.7.1; TTL + RLS + Referrer-Policy
provide a defensible posture at the v1.7.1 scope.
