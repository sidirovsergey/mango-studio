export const SCENE_ASSETS_BUCKET = 'scene-assets';

type SceneKind = 'first_frame' | 'video' | 'voice_audio';
const KIND_SUFFIX: Record<SceneKind, string> = {
  first_frame: 'frame',
  video: 'video',
  voice_audio: 'voice',
};

export function sceneAssetStoragePath(args: {
  user_id: string;
  project_id: string;
  scene_id: string;
  version_id: string;
  kind: SceneKind;
  ext: string;
}): string {
  return `${args.user_id}/${args.project_id}/${args.scene_id}/${args.version_id}-${KIND_SUFFIX[args.kind]}.${args.ext}`;
}

export function masterClipStoragePath(args: {
  user_id: string;
  project_id: string;
  version_id: string;
  ext: string;
}): string {
  return `${args.user_id}/${args.project_id}/master/${args.version_id}.${args.ext}`;
}
