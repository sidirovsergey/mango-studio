import 'server-only';

import {
  type ModelTier,
  type NormalizedScene,
  type NormalizedScript,
  aggregateProjectPrice,
  normalizeScript,
} from '@mango/core';
import { getServiceRoleSupabase } from '@mango/db/server';

/**
 * Phase 1.8.1 — Public Project View mapper.
 *
 * **Security boundary.** The `/p/[publicSlug]` route reads `projects` rows via
 * `service_role`, bypassing the owner-only RLS policy. This mapper is the
 * EXPLICIT allowlist that controls which fields cross the boundary.
 *
 * Allowlist (per Codex audit on the Phase 1.8 migration plan, 2026-05-18):
 *
 * - projects: `id`, `public_slug`, `title`, `status`, `format`,
 *   `target_duration_sec`, `created_at`
 * - script.scenes[]: `scene_id`, `duration_sec`, `narrative_paragraph`,
 *   `dialogue`, `shots`, `first_frame_url`, `arc_role`
 * - aggregate price: precomputed kopeks total + breakdown
 *
 * Explicitly EXCLUDED (would leak via `select *`):
 * - `projects.user_id` — privacy
 * - `projects.idea` — user's private input
 * - `projects.tier` — internal pricing tier (price is precomputed instead)
 * - `user_accounts.email` — never join in
 * - `media_jobs.cost_usd, fal_request_id, request_input, result_storage` — internal audit
 * - `scene.config_overrides.model` — could fingerprint our provider mix
 *
 * Tests in `public-project-view.test.ts` assert that none of these fields
 * survive the mapper. Future maintainers: if you add a field to
 * PublicProjectView, also add a leak-prevention test for it.
 */

export interface PublicScene {
  scene_id: string;
  duration_sec: number;
  narrative_paragraph: string;
  dialogue: Array<{ speaker: string; text: string }>;
  shots: Array<{ shot_id: string; image_prompt: string }>;
  first_frame_url: string | null;
  arc_role: string | null;
}

export interface PublicProjectView {
  id: string;
  public_slug: string;
  title: string | null;
  status: string;
  format: string;
  target_duration_sec: number;
  created_at: string;
  scenes: PublicScene[];
  scenes_count: number;
  price: {
    render_kopeks: number;
    render_modifiers: Array<{ name: string; kopeks: number }>;
  };
}

/** Raw project row shape — narrow local type, NOT the full Database row. */
type ProjectRowSubset = {
  id: string;
  public_slug: string;
  title: string | null;
  status: string;
  format: string;
  target_duration_sec: number;
  created_at: string;
  tier: string | null;
  script: unknown;
};

/** Effective tier per scene: scene_override ?? project_tier ?? 'economy'. */
function effectiveTier(scene: NormalizedScene, projectTier: ModelTier): ModelTier {
  // Read scene tier_override from raw script (NormalizedScene strips it from
  // the typed view; we go through .raw indirectly via the caller's normalised
  // result, which carries the original `tier_at_gen` and `config_overrides`).
  // For 1.8.1, default to projectTier — scene-level overrides are a
  // 1.8.4 (Pro-Студия editing) concern.
  void scene;
  return projectTier;
}

/**
 * Resolve a `scene.first_frame_versions[active]` storage entry to a public URL.
 * Uses `service_role` Supabase client to create a 1-hour signed URL for
 * supabase-stored assets; pass-through for fal CDN URLs.
 */
async function resolveFirstFrameUrl(
  rawScene: Record<string, unknown>,
  serviceRole: ReturnType<typeof getServiceRoleSupabase>,
): Promise<string | null> {
  const versions = rawScene.first_frame_versions as Array<Record<string, unknown>> | undefined;
  const activeId = rawScene.first_frame_active_version_id as string | null | undefined;
  if (!versions || versions.length === 0) return null;
  const active = activeId
    ? versions.find((v) => v.version_id === activeId)
    : versions[versions.length - 1];
  if (!active) return null;
  const storage = active.storage as Record<string, unknown> | undefined;
  if (!storage) return null;
  if (storage.kind === 'fal_passthrough' && typeof storage.url === 'string') {
    return storage.url;
  }
  if (storage.kind === 'supabase' && typeof storage.path === 'string') {
    const sbStorage = serviceRole.storage as unknown as {
      from: (bucket: string) => {
        createSignedUrl: (
          path: string,
          expiresInSec: number,
        ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
      };
    };
    const { data, error } = await sbStorage
      .from('scene-assets')
      .createSignedUrl(storage.path as string, 3600);
    if (error || !data) {
      console.warn('[public-project-view] signed URL failed', {
        path: storage.path,
        error: error?.message,
      });
      return null;
    }
    return data.signedUrl;
  }
  return null;
}

/**
 * Build the public view from a project row + script. Returns `null` if the
 * script is missing or the row is malformed (defensive — never throw).
 */
export async function toPublicProjectView(
  row: ProjectRowSubset,
): Promise<PublicProjectView | null> {
  if (!row.script) return null;

  let normalised: NormalizedScript;
  try {
    normalised = normalizeScript(row.script);
  } catch (err) {
    console.warn('[public-project-view] normalizeScript threw', { id: row.id, err });
    return null;
  }

  const projectTier: ModelTier = row.tier === 'premium' ? 'premium' : 'economy';
  const serviceRole = getServiceRoleSupabase();

  // Resolve first_frame URLs in parallel (cap concurrency via Promise.all on
  // typical 4-8 scenes; no rate-limit concern for storage signed URLs).
  const rawScenes = (normalised.raw as { scenes: Array<Record<string, unknown>> })?.scenes ?? [];
  const scenes: PublicScene[] = await Promise.all(
    normalised.scenes.map(async (s, i) => {
      const rawScene = rawScenes[i] ?? {};
      const first_frame_url = await resolveFirstFrameUrl(rawScene, serviceRole);
      return {
        scene_id: s.scene_id,
        duration_sec: s.duration_sec,
        narrative_paragraph: s.narrative_paragraph,
        // Strip speaker types; expose only the public fields.
        dialogue: s.dialogue.map((d) => ({ speaker: d.speaker, text: d.text })),
        shots: s.shots.map((shot) => ({
          shot_id: shot.shot_id,
          image_prompt: shot.image_prompt,
        })),
        first_frame_url,
        arc_role: s.arc_role ?? null,
      };
    }),
  );

  // Pre-compute aggregate render price. Each scene uses its effective tier.
  const aggregate = aggregateProjectPrice({
    scenes: normalised.scenes.map((s) => ({
      scene_id: s.scene_id,
      model_tier: effectiveTier(s, projectTier),
    })),
    withMasterClip: true,
  });

  return {
    id: row.id,
    public_slug: row.public_slug,
    title: row.title,
    status: row.status,
    format: row.format,
    target_duration_sec: row.target_duration_sec,
    created_at: row.created_at,
    scenes,
    scenes_count: scenes.length,
    price: {
      render_kopeks: aggregate.kopeks,
      render_modifiers: aggregate.breakdown.modifiers,
    },
  };
}

/**
 * Fetch the project row by public_slug via service_role + map to the public
 * view. Returns `null` when no project matches OR mapping fails.
 *
 * SECURITY: service_role bypasses RLS — relying on the mapper allowlist as
 * the boundary. Do NOT add `select *` here. The fields listed are exactly
 * the ProjectRowSubset shape; if you need a new field, also extend the
 * type + the mapper + the leak test.
 */
export async function fetchPublicProjectBySlug(
  publicSlug: string,
): Promise<PublicProjectView | null> {
  const sb = getServiceRoleSupabase();
  const sbFrom = sb.from as unknown as (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{
          data: ProjectRowSubset | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await sbFrom('projects')
    .select('id, public_slug, title, status, format, target_duration_sec, created_at, tier, script')
    .eq('public_slug', publicSlug)
    .maybeSingle();
  if (error) {
    console.error('[public-project-view] fetch failed', { publicSlug, error: error.message });
    return null;
  }
  if (!data) return null;
  return toPublicProjectView(data);
}
