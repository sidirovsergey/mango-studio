'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import {
  SCENE_ASSETS_BUCKET,
  masterClipStoragePath,
  sceneAssetStoragePath,
} from '@/server/lib/storage-paths';
import { getServiceRoleSupabase } from '@mango/db/server';

type Kind = 'first_frame' | 'video' | 'voice_audio' | 'master_clip';

type Result = { ok: true; path: string } | { ok: false; error: string };

type VersionStorage =
  | { kind: 'fal_passthrough'; url: string }
  | { kind: 'supabase'; bucket: string; path: string };

type Version = { version_id: string; storage: VersionStorage };

export async function mirrorSceneAssetToStorage(args: {
  project_id: string;
  scene_id?: string; // null for master_clip
  version_id: string;
  kind: Kind;
  ext: string;
}): Promise<Result> {
  try {
    const user = await getCurrentUser();
    const sb = getServiceRoleSupabase();

    // 1. Read project script to find the version with current fal URL
    const { data: project, error: pErr } = await sb
      .from('projects')
      .select('script')
      .eq('id', args.project_id)
      .maybeSingle();
    if (pErr || !project) return { ok: false, error: 'project not found' };
    // biome-ignore lint/suspicious/noExplicitAny: jsonb script schema is dynamic at this layer
    const script = project.script as any;

    // 2. Locate version
    let version: Version | undefined;
    if (args.kind === 'master_clip') {
      version = (script.master_clip_versions ?? []).find(
        (v: Version) => v.version_id === args.version_id,
      );
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: jsonb script schema is dynamic at this layer
      const scene = (script.scenes ?? []).find((s: any) => s.scene_id === args.scene_id);
      if (!scene) return { ok: false, error: 'scene not found' };
      const arrKey = `${args.kind === 'first_frame' ? 'first_frame' : args.kind}_versions`;
      version = (scene[arrKey] ?? []).find((v: Version) => v.version_id === args.version_id);
    }
    if (!version) return { ok: false, error: 'version not found' };
    if (version.storage.kind !== 'fal_passthrough') {
      return { ok: true, path: version.storage.path }; // already mirrored
    }

    // 3. Download from fal CDN
    const res = await fetch(version.storage.url);
    if (!res.ok) return { ok: false, error: `fetch ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

    // 4. Build path + upload
    const path =
      args.kind === 'master_clip'
        ? masterClipStoragePath({
            user_id: user.id,
            project_id: args.project_id,
            version_id: args.version_id,
            ext: args.ext,
          })
        : sceneAssetStoragePath({
            user_id: user.id,
            project_id: args.project_id,
            scene_id: args.scene_id ?? '',
            version_id: args.version_id,
            kind: args.kind,
            ext: args.ext,
          });

    const { error: upErr } = await sb.storage
      .from(SCENE_ASSETS_BUCKET)
      .upload(path, buf, { contentType, upsert: true });
    if (upErr) return { ok: false, error: upErr.message };

    // 5. Update jsonb via atomic RPC.
    //
    // Previously this did read-modify-write on `projects.script`:
    //   - SELECT script
    //   - structuredClone + JS mutation
    //   - UPDATE projects SET script = newScript
    //
    // Step 5's UPDATE used a JS value computed from a separate SELECT — classic
    // lost-update. With fire-and-forget concurrency from runPollTick (4
    // first_frame mirrors started in parallel after one tick of finalizes),
    // mirror writes overwrote finalize writes and dropped scene versions.
    // Observed in prod 2026-05-23: project dc1735ae lost s3 + s4
    // first_frame_versions despite all 4 fal jobs completing successfully.
    //
    // `fn_mirror_version_storage` does the whole transformation inside ONE
    // SQL UPDATE — the read of `script` inside the subquery and the write of
    // `script` happen under the same row lock. Concurrent mirror calls and
    // concurrent finalize-vs-mirror serialize per-project at the row level.
    const rpc = sb.rpc.bind(sb) as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
    const { data: updated, error: updErr } = await rpc('fn_mirror_version_storage', {
      p_project_id: args.project_id,
      p_kind: args.kind,
      p_scene_id: args.scene_id ?? null,
      p_version_id: args.version_id,
      p_new_storage: { kind: 'supabase', bucket: SCENE_ASSETS_BUCKET, path },
    });
    if (updErr) return { ok: false, error: updErr.message };
    if (updated === false) {
      // No row matched (project deleted between mirror-trigger and now);
      // bytes uploaded but jsonb not updated. Safe to ignore: orphan storage
      // is reaped by the standard cleanup job.
      console.warn('[mirrorSceneAssetToStorage] RPC matched no project', {
        project_id: args.project_id,
        version_id: args.version_id,
      });
    }

    return { ok: true, path };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    return { ok: false, error: msg };
  }
}
