import type { MasterClipVersion, SceneAssetVersion } from './scene-types';

export const MAX_VERSIONS = 5;

export type VersionedAsset<V extends { version_id: string; generated_at: string }> = {
  versions: V[];
  active_version_id: string | null;
};

export type AppendResult<V extends { version_id: string; generated_at: string }> = {
  versions: V[];
  active_version_id: string;
  dropped: V | null; // version evicted by overflow
};

export function appendVersion<V extends { version_id: string; generated_at: string }>(
  state: VersionedAsset<V>,
  newVersion: V,
): AppendResult<V> {
  const next = [...state.versions, newVersion];
  let dropped: V | null = null;
  if (next.length > MAX_VERSIONS) {
    // Drop oldest by generated_at
    const sorted = [...next].sort((a, b) => a.generated_at.localeCompare(b.generated_at));
    dropped = sorted[0]!;
    const droppedId = dropped.version_id;
    const filtered = next.filter((v) => v.version_id !== droppedId);
    return { versions: filtered, active_version_id: newVersion.version_id, dropped };
  }
  return { versions: next, active_version_id: newVersion.version_id, dropped: null };
}

export function getActiveVersion<V extends { version_id: string; generated_at: string }>(
  state: VersionedAsset<V>,
): V | null {
  if (!state.active_version_id) return null;
  return state.versions.find((v) => v.version_id === state.active_version_id) ?? null;
}

export function setActiveVersion<V extends { version_id: string; generated_at: string }>(
  state: VersionedAsset<V>,
  target_version_id: string,
): VersionedAsset<V> {
  const found = state.versions.find((v) => v.version_id === target_version_id);
  if (!found) {
    throw new Error(
      `setActiveVersion: version_id "${target_version_id}" not found in ${state.versions.length} versions`,
    );
  }
  return { versions: state.versions, active_version_id: target_version_id };
}

export function rollbackToPrevious<V extends { version_id: string; generated_at: string }>(
  state: VersionedAsset<V>,
): VersionedAsset<V> {
  const sorted = [...state.versions].sort((a, b) => a.generated_at.localeCompare(b.generated_at));
  const activeIdx = sorted.findIndex((v) => v.version_id === state.active_version_id);
  if (activeIdx <= 0) {
    throw new Error(`rollbackToPrevious: no previous version (active_idx=${activeIdx})`);
  }
  const prev = sorted[activeIdx - 1]!;
  return { versions: state.versions, active_version_id: prev.version_id };
}

export function dropOldestIfOverflow<V extends { version_id: string; generated_at: string }>(
  state: VersionedAsset<V>,
): { state: VersionedAsset<V>; dropped: V | null } {
  if (state.versions.length <= MAX_VERSIONS) return { state, dropped: null };
  const sorted = [...state.versions].sort((a, b) => a.generated_at.localeCompare(b.generated_at));
  const dropped = sorted[0]!;
  return {
    state: {
      versions: state.versions.filter((v) => v.version_id !== dropped.version_id),
      active_version_id: state.active_version_id,
    },
    dropped,
  };
}

// Re-exported convenience aliases for known kinds
export type SceneAssetVersionedState = VersionedAsset<SceneAssetVersion>;
export type MasterClipVersionedState = VersionedAsset<MasterClipVersion>;
