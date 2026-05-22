-- Phase 1.7 latent bug fix (2026-05-22)
--
-- The original billing migration (20260518000002_billing.sql) created
-- only a SELECT policy for billing_payments. INSERT under RLS is therefore
-- blocked for anon/authenticated callers, but createTopupForAuthedUser
-- (Phase 1.8.3, apps/web/src/server/lib/topup-core.ts) INSERTs through the
-- user-scoped supabase client. Until today the UI flags + missing ЮKassa
-- keys prevented anyone from exercising the path in prod; Phase 1.8.3 mock
-- flow first triggered it on 2026-05-22.
--
-- The webhook keeps using service_role (bypasses RLS) for UPDATE — that
-- boundary is unchanged. We just add INSERT for the authenticated user
-- creating their own payment row.

CREATE POLICY "billing_payments_own_insert" ON billing_payments
  FOR INSERT WITH CHECK (user_id = auth.uid());
