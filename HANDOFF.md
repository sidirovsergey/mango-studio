# Phase 1.6 — Subagent-Driven Execution Handoff

**Session created:** 2026-05-17 from controller session that authored the spec + plan.
**Branch:** `feature/phase-1.6-identity` (off `main` at `2f80866`)
**Worktree path:** `C:/mango-studio/.worktrees/phase-1.6` (this directory)

## What to do when you open a new Claude Code session here

### 1. One-time setup
```powershell
cd C:\mango-studio\.worktrees\phase-1.6
pnpm install                          # install deps in this worktree
copy ..\..\.env.local .env.local      # mirror env from main worktree
pnpm --filter @mango/web typecheck    # sanity check
pnpm --filter @mango/web test --run   # 110 tests should pass (baseline)
```

### 2. Read the plan + spec
- Plan: [`docs/superpowers/plans/2026-05-17-phase-1.6-identity.md`](../../docs/superpowers/plans/2026-05-17-phase-1.6-identity.md) (30 tasks, 8 sub-phases A–H, 1664 lines).
- Spec: [`docs/superpowers/specs/2026-05-17-phase-1.6-identity-design.md`](../../docs/superpowers/specs/2026-05-17-phase-1.6-identity-design.md) (281 lines, verified by 2 Codex audit passes).
- Memory log: `~/.claude/projects/C--Mango-Studio/memory/project_phase1.6_decisions.md`.

### 3. Invoke the execution skill
```
superpowers:subagent-driven-development
```

Then per `feedback_execution_mode.md` user preference:
- **Dispatch loop:** fresh subagent per task (implementer → spec-reviewer → code-quality-reviewer per the skill's own protocol).
- **Codex checkpoints:** at every sub-phase boundary (A→B, B→C, …) call `codex:rescue` for an independent audit of the sub-phase's commit range. Apply findings before starting the next sub-phase.
- **Final Codex pass** before opening the PR.

### 4. Sub-phase order
- A — Prerequisites (MediaJobKind TS↔DB alignment, schema preflight)
- B — DB migration (table + RLS + 2 SECURITY DEFINER triggers + backfill via MCP)
- C — `@mango/core/quota` module (AccountTier, TierGateError, assertCapability)
- D — Server-action tier gates (generateScene/FirstFrame/MasterClip)
- E — Auth UI + actions (/login, sendOtp/verifyOtp/signOut, AccountMenu, ClaimWorkBanner, TierGateModal)
- F — SMTP + Supabase Auth dashboard config (manual; DNS + creds + rate limits + RU email templates)
- G — Feature flags (`NEXT_PUBLIC_AUTH_UI_ENABLED`, `AUTH_GATE_ENFORCE`)
- H — Rollout (PR + canary observation + flag flip + E2E + tag `v1.6.0`)

### 5. Open questions the spec deliberately left for the executing session
- UI copy for `ClaimWorkBanner` and `TierGateModal` — needs brand voice review.
- Anon user project count in `AccountMenu` — optional motivator; decide before implementing E5.
- Per-IP throttle on `sendOtpAction` — implement now (Vercel KV / Supabase rpc) OR rely on Supabase Auth per-email limit. Default: rely on Supabase unless Codex audit pushes back.
- Telemetry events — Vercel Analytics or Supabase `_request_log`? Skip if it slows ship.

### 6. Manual pre-flight (cannot be coded)
- DNS records for `mangopro.ru` (SPF + DKIM + DMARC) — verify with `dig` before SMTP setup.
- Supabase Auth dashboard: enable email provider, configure custom SMTP (`smtp.mangopro.ru`), set rate limits (1 OTP/60s per email + 5/15min), upload Russian email templates.
- Pre-seed owner's `user_accounts.tier='free'` in prod BEFORE flipping flags (per spec §3.7 step 2; SQL in plan Task B2 step 3).

### 7. Ship discipline (per Phase 1.5 lesson)
- `feedback_live_smoke_before_ship_declaration` — never declare shipped without hitting prod URL with primary user flow after deploy.
- `feedback_supabase_migration_deploy_gap` — verify migration via `list_migrations` MCP against prod project id; code in `supabase/migrations/` is NOT proof of deployment.

### 8. Useful references in memory
- `project_phase1.5_status.md` — last shipped state + post-ship miss pattern.
- `feedback_prompt_engineering_patterns.md` — patterns to apply to new AI surfaces (not applicable in 1.6, but worth a scan).
- `feedback_execution_mode.md` — Subagent-Driven + Codex sub-phase audit pattern (user preference).

---

**Controller session terminated here.** Open a fresh session in this directory to start execution.
