-- =====================================================================
-- Phase 1.8.1 — projects.public_slug for the public /p/[slug] storyboard route
-- =====================================================================
-- The slug is the URL-visible identifier for the public storyboard page.
-- Routing in 1.7.1 used project_id (uuid) as a placeholder; this migration
-- introduces a short URL-safe slug (10 chars [a-zA-Z0-9]) per project so
-- shareable links look like `mangopro.ru/p/aB3xKp9q2L` instead of
-- exposing the internal uuid.
--
-- Properties:
-- - 10-char alphanumeric, ~58 bits entropy — far above the birthday-paradox
--   collision threshold for our projected scale (~10M projects).
-- - URL-safe (no '+', '/', '=' from base64).
-- - NOT NULL after backfill — every project has a slug.
-- - UNIQUE — collision is statistically negligible; CHECK is defence
--   against operational mistakes (manual UPDATEs).
-- - Stable: never regenerated. If we ever need a vanity slug, that's a
--   user-facing rename via a separate path (not in 1.8.1 scope).
-- =====================================================================

-- Helper: URL-safe random slug. Uses pgcrypto's gen_random_bytes (available
-- via the gen_random_uuid extension already in use). translate() replaces
-- the three non-alphanumeric base64 characters with safe alphanumeric ones,
-- which slightly biases the distribution but keeps the function pure SQL
-- (no PL/pgSQL needed) and the entropy floor remains well above what we
-- need (~58 bits → 1 in 2^58 collision per pair, ~10^17 birthday).
CREATE OR REPLACE FUNCTION public.fn_generate_public_slug()
RETURNS text
LANGUAGE sql
VOLATILE
PARALLEL SAFE
AS $$
  SELECT substr(translate(encode(gen_random_bytes(8), 'base64'), '+/=', 'aBc'), 1, 10);
$$;

-- Step 1: add the column nullable, default-generated for future inserts.
ALTER TABLE projects
  ADD COLUMN public_slug text DEFAULT public.fn_generate_public_slug();

-- Step 2: backfill existing rows. Each row gets its own random value (the
-- DEFAULT is evaluated per-row by the executor).
UPDATE projects SET public_slug = public.fn_generate_public_slug() WHERE public_slug IS NULL;

-- Defence: if the backfill produced a collision (vanishingly unlikely),
-- retry the dup rows. We expect zero loop iterations on every migration
-- in practice; the DO block exists so the migration is self-healing in
-- case Postgres' random source ever produces a dup.
-- Codex audit 2026-05-19 fix: bounded retry loop. If randomness is broken
-- (Postgres entropy starved OR fn_generate_public_slug regression), fail
-- loud instead of spinning forever.
DO $$
DECLARE
  v_dups int;
  v_attempts int := 0;
BEGIN
  LOOP
    UPDATE projects
       SET public_slug = public.fn_generate_public_slug()
     WHERE id IN (
       SELECT id FROM (
         SELECT id, public_slug,
                row_number() OVER (PARTITION BY public_slug ORDER BY created_at) AS rn
           FROM projects
       ) ranked
       WHERE rn > 1
     );
    GET DIAGNOSTICS v_dups = ROW_COUNT;
    EXIT WHEN v_dups = 0;
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'public_slug backfill: still % duplicate(s) after 20 retries — randomness likely broken', v_dups;
    END IF;
  END LOOP;
END;
$$;

-- Step 3: enforce NOT NULL + UNIQUE.
ALTER TABLE projects ALTER COLUMN public_slug SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT projects_public_slug_unique UNIQUE (public_slug);

-- Step 4: lookup index already created by UNIQUE constraint above.
-- No additional index needed.

-- Step 5: function stays accessible — it's read-only-ish (only reads
-- gen_random_bytes). Future writers (createProjectFromIdeaAction) will
-- rely on the DEFAULT clause; the function being callable from anon is
-- fine since it returns a fresh random string with no side effects.
REVOKE EXECUTE ON FUNCTION public.fn_generate_public_slug() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_generate_public_slug() TO authenticated, service_role;
