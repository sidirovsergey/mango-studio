import { describe, expect, it } from 'vitest';
import type { SceneAssetVersion } from './scene-types';
import {
  appendVersion,
  dropOldestIfOverflow,
  getActiveVersion,
  rollbackToPrevious,
  setActiveVersion,
} from './scene-versions';

const v = (id: string, ts: string): SceneAssetVersion => ({
  version_id: id,
  storage: { kind: 'fal_passthrough', url: `https://fal.media/${id}.jpg` },
  prompt: null,
  model: null,
  generated_at: ts,
  cost_usd: null,
  source: 'auto_continuity',
});

describe('appendVersion', () => {
  it('appends to empty array, sets active', () => {
    const r = appendVersion({ versions: [], active_version_id: null }, v('v1', '2026-01-01'));
    expect(r.versions).toHaveLength(1);
    expect(r.active_version_id).toBe('v1');
  });

  it('appends to existing, makes new active', () => {
    const r = appendVersion(
      { versions: [v('v1', '2026-01-01')], active_version_id: 'v1' },
      v('v2', '2026-01-02'),
    );
    expect(r.versions).toHaveLength(2);
    expect(r.active_version_id).toBe('v2');
  });

  it('drops oldest when overflow > 5', () => {
    const initial = ['v1', 'v2', 'v3', 'v4', 'v5'].map((id, i) => v(id, `2026-01-0${i + 1}`));
    const r = appendVersion({ versions: initial, active_version_id: 'v5' }, v('v6', '2026-01-06'));
    expect(r.versions).toHaveLength(5);
    expect(r.versions.map((x) => x.version_id)).toEqual(['v2', 'v3', 'v4', 'v5', 'v6']);
    expect(r.dropped?.version_id).toBe('v1');
  });
});

describe('setActiveVersion', () => {
  it('sets active when version exists', () => {
    const versions = [v('v1', '2026-01-01'), v('v2', '2026-01-02')];
    const r = setActiveVersion({ versions, active_version_id: 'v2' }, 'v1');
    expect(r.active_version_id).toBe('v1');
  });

  it('throws when version_id not found', () => {
    expect(() =>
      setActiveVersion({ versions: [v('v1', 'x')], active_version_id: 'v1' }, 'unknown'),
    ).toThrow(/not found/);
  });
});

describe('rollbackToPrevious', () => {
  it('returns version one before active by generated_at', () => {
    const versions = [v('v1', '2026-01-01'), v('v2', '2026-01-02'), v('v3', '2026-01-03')];
    const r = rollbackToPrevious({ versions, active_version_id: 'v3' });
    expect(r.active_version_id).toBe('v2');
  });

  it('throws when active is the only/oldest version', () => {
    expect(() => rollbackToPrevious({ versions: [v('v1', 'x')], active_version_id: 'v1' })).toThrow(
      /no previous/,
    );
  });
});

describe('getActiveVersion', () => {
  it('returns active version object', () => {
    const versions = [v('v1', 'x'), v('v2', 'y')];
    expect(getActiveVersion({ versions, active_version_id: 'v2' })?.version_id).toBe('v2');
  });

  it('returns null if active_id null', () => {
    expect(getActiveVersion({ versions: [], active_version_id: null })).toBeNull();
  });
});

describe('dropOldestIfOverflow', () => {
  it('returns same state when within limit', () => {
    const versions = [v('v1', '2026-01-01'), v('v2', '2026-01-02')];
    const r = dropOldestIfOverflow({ versions, active_version_id: 'v2' });
    expect(r.dropped).toBeNull();
    expect(r.state.versions).toHaveLength(2);
  });

  it('drops oldest when overflow', () => {
    const versions = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'].map((id, i) =>
      v(id, `2026-01-0${i + 1}`),
    );
    const r = dropOldestIfOverflow({ versions, active_version_id: 'v6' });
    expect(r.dropped?.version_id).toBe('v1');
    expect(r.state.versions).toHaveLength(5);
  });
});
