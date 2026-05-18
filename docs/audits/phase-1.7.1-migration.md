# Phase 1.7.1 — migration audit

**Date:** 2026-05-18
**Migration:** `20260518000003_billing_intents`
**Project:** `mgsfjyojbidhkxiknhsy` (mango studio prod)

## Apply command

```
mcp__supabase__apply_migration(
  project_id="mgsfjyojbidhkxiknhsy",
  name="20260518000003_billing_intents",
  query=<see supabase/migrations/20260518000003_billing_intents.sql>
)
```

Returned `{"success": true}` on 2026-05-18.

## Post-apply verification

```sql
SELECT
  (SELECT COUNT(*) FROM billing_intents) AS intents_rows,
  (SELECT array_agg(proname) FROM pg_proc WHERE proname LIKE 'fn_%intent%' OR proname = 'fn_link_payment_to_intent') AS fns,
  (SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'billing_intents_one_pending_per_project_kind')) AS partial_unique_idx_exists,
  (SELECT column_name FROM information_schema.columns WHERE table_name = 'billing_payments' AND column_name = 'intent_id') AS billing_payments_intent_id_col;
```

Result:

| Check | Value | Expected |
|---|---|---|
| `intents_rows` | 0 | 0 (fresh table) |
| `fns` | `{fn_inspect_intent, fn_settle_paid_intent, fn_mark_intent_consumed, fn_link_payment_to_intent, fn_get_or_create_intent}` | 5 fns present |
| `partial_unique_idx_exists` | true | true |
| `billing_payments_intent_id_col` | `intent_id` | present |

✅ All four invariants pass.

## migration list verification

`mcp__supabase__list_migrations` shows latest:

- `20260518115605 / 20260518000002_billing` (v1.7.0)
- `20260518... / 20260518000003_billing_intents` (this migration, v1.7.1 base)

## Surface added

- **Table** `billing_intents` (11 columns; nonce UNIQUE, partial UNIQUE on `(project_id, kind) WHERE status='pending'`, RLS own-select).
- **Column** `billing_payments.intent_id uuid NULL` (FK to billing_intents, ON DELETE SET NULL).
- **Functions** (all `SECURITY DEFINER`, `search_path = '', pg_catalog, public`):
  - `fn_get_or_create_intent(p_user_id, p_project_id, p_kind, p_nonce, p_return_to)` — atomic upsert with two-tab race handling. Enforces `p_user_id = auth.uid()`.
  - `fn_inspect_intent(p_nonce)` — read-only state lookup. Codex blocker fix #1.
  - `fn_settle_paid_intent(p_billing_payment_id)` — promote `pending|expired → paid`. Codex blocker fix #3 (accepts both source states).
  - `fn_mark_intent_consumed(p_intent_id)` — terminal flip after media_jobs reserved.
  - `fn_link_payment_to_intent(p_intent_id, p_billing_payment_id)` — atomic backlink helper.

## Grants matrix

| Function | anon | authenticated | service_role |
|---|---|---|---|
| `fn_get_or_create_intent` | ✗ | ✓ | ✓ |
| `fn_inspect_intent` | ✗ | ✓ | ✓ |
| `fn_settle_paid_intent` | ✗ | ✗ | ✓ |
| `fn_mark_intent_consumed` | ✗ | ✗ | ✓ |
| `fn_link_payment_to_intent` | ✗ | ✓ | ✓ |

Locked-down by default; only service-role can settle/consume (webhook entry).
`fn_get_or_create_intent` + `fn_link_payment_to_intent` callable from server actions running with authenticated JWT.
`fn_inspect_intent` callable from authenticated client (via `/p/[slug]` RSC).

## Rollback procedure

If rollback is ever needed (release-day disaster only):

```sql
BEGIN;
ALTER TABLE billing_payments DROP COLUMN intent_id;
DROP FUNCTION public.fn_get_or_create_intent(uuid, uuid, text, text, text);
DROP FUNCTION public.fn_inspect_intent(text);
DROP FUNCTION public.fn_settle_paid_intent(uuid);
DROP FUNCTION public.fn_mark_intent_consumed(uuid);
DROP FUNCTION public.fn_link_payment_to_intent(uuid, uuid);
DROP TABLE billing_intents;
COMMIT;
```

Safe because `billing_intents` is a new table; `billing_payments.intent_id` is nullable (existing v1.7.0 rows have NULL there). No data backfill performed by this migration.

## Coordination with v1.7.0

v1.7.0 base (`20260518000002_billing`) provides `billing_payments` table. The `billing_payments.intent_id` column added here is nullable + FK + ON DELETE SET NULL — purely additive, zero impact on existing v1.7.0 callers that don't pass `intent`.

`fn_apply_topup` (from v1.7.0) is untouched. The webhook handler in Sub-phase D will call `fn_apply_topup` first (existing flow), then `fn_settle_paid_intent` if the payment row has `intent_id`. Order matters: settle must follow apply, never precede.
