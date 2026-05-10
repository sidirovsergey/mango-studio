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

    // 5. Update jsonb — replace storage of that version
    const newScript = updateVersionStorage(script, args, {
      kind: 'supabase',
      bucket: SCENE_ASSETS_BUCKET,
      path,
    });
    const { error: updErr } = await sb
      .from('projects')
      .update({ script: newScript })
      .eq('id', args.project_id);
    if (updErr) return { ok: false, error: updErr.message };

    return { ok: true, path };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    return { ok: false, error: msg };
  }
}

function updateVersionStorage(
  // biome-ignore lint/suspicious/noExplicitAny: jsonb script schema is dynamic at this layer
  script: any,
  args: { kind: Kind; scene_id?: string; version_id: string },
  newStorage: { kind: 'supabase'; bucket: string; path: string },
) {
  const cloned = structuredClone(script);
  if (args.kind === 'master_clip') {
    cloned.master_clip_versions = cloned.master_clip_versions.map((v: Version) =>
      v.version_id === args.version_id ? { ...v, storage: newStorage } : v,
    );
  } else {
    const arrKey = `${args.kind}_versions`;
    // biome-ignore lint/suspicious/noExplicitAny: jsonb script schema is dynamic at this layer
    cloned.scenes = cloned.scenes.map((s: any) =>
      s.scene_id !== args.scene_id
        ? s
        : {
            ...s,
            [arrKey]: s[arrKey].map((v: Version) =>
              v.version_id === args.version_id ? { ...v, storage: newStorage } : v,
            ),
          },
    );
  }
  return cloned;
}
