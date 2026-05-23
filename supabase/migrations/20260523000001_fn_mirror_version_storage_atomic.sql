-- 2026-05-23 — data-loss race fix.
--
-- BACKGROUND
-- ----------
-- `apps/web/src/server/actions/mirrorSceneAssetToStorage.ts` does
-- fire-and-forget read-modify-write on `projects.script` (jsonb):
--   1. SELECT script
--   2. structuredClone + JS mutation
--   3. UPDATE projects SET script = newScript
--
-- Steps 1 and 3 are separate statements. With 4 first_frame jobs completing
-- back-to-back inside `reconcileFirstFrames`, runPollTick fires `void
-- mirror(...)` after each finalize. The mirror tasks run concurrently with
-- subsequent finalize writes AND with each other. Whoever writes last —
-- using its stale read of script — wipes out the others' changes.
--
-- Observed in prod 2026-05-23: project dc1735ae-... lost s3 + s4
-- first_frame_versions despite all 4 fal jobs being completed and bytes
-- successfully uploaded to storage. User saw 2 of 4 thumbnails on /p/{slug}.
--
-- FIX
-- ---
-- This RPC does the read+modify+write inside ONE atomic SQL UPDATE statement.
-- The subquery's reference to `script` happens under the row's update lock,
-- so concurrent invocations serialize per-project and no writer ever bases
-- its result on a stale snapshot.
--
-- Updates ONLY the storage descriptor of a specific (kind, scene_id,
-- version_id) tuple. The rest of the script jsonb passes through jsonb_agg
-- on the existing arrays — no clones, no risk of overwriting unrelated parts.
--
-- Already applied to prod via Supabase MCP `apply_migration` 2026-05-23
-- before this file was committed.
CREATE OR REPLACE FUNCTION public.fn_mirror_version_storage(
  p_project_id uuid,
  p_kind text,
  p_scene_id text,
  p_version_id uuid,
  p_new_storage jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
DECLARE
  v_arr_key text;
  v_updated boolean := false;
BEGIN
  IF p_kind = 'master_clip' THEN
    UPDATE projects
    SET script = jsonb_set(
      script,
      '{master_clip_versions}',
      COALESCE(
        (SELECT jsonb_agg(
          CASE WHEN (v->>'version_id')::uuid = p_version_id
            THEN jsonb_set(v, '{storage}', p_new_storage)
            ELSE v
          END
        ) FROM jsonb_array_elements(script->'master_clip_versions') v),
        '[]'::jsonb
      )
    )
    WHERE id = p_project_id;
    v_updated := FOUND;
  ELSE
    v_arr_key := p_kind || '_versions';
    UPDATE projects
    SET script = jsonb_set(
      script,
      '{scenes}',
      COALESCE(
        (SELECT jsonb_agg(
          CASE WHEN s->>'scene_id' = p_scene_id
            THEN jsonb_set(
              s,
              ARRAY[v_arr_key],
              COALESCE(
                (SELECT jsonb_agg(
                  CASE WHEN (v->>'version_id')::uuid = p_version_id
                    THEN jsonb_set(v, '{storage}', p_new_storage)
                    ELSE v
                  END
                ) FROM jsonb_array_elements(s->v_arr_key) v),
                '[]'::jsonb
              )
            )
            ELSE s
          END
        ) FROM jsonb_array_elements(script->'scenes') s),
        '[]'::jsonb
      )
    )
    WHERE id = p_project_id;
    v_updated := FOUND;
  END IF;

  RETURN v_updated;
END;
$$;

-- Service-role-only execute, same sandboxing as fn_reserve_balance.
-- Callers (mirror action) use getServiceRoleSupabase().
REVOKE EXECUTE ON FUNCTION public.fn_mirror_version_storage(uuid, text, text, uuid, jsonb)
  FROM PUBLIC, authenticated, anon;
