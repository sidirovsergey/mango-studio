import { describe, expect, it } from 'vitest';
import type { SceneAssetVersion } from '../media/scene-types';
import { formatProjectStateSummary } from './director-state-summary';
import type { DirectorStateSummaryInput } from './director-state-summary';
import type { Scene } from './schemas';
import type { Character } from './types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mkScene = (overrides: Partial<Omit<Scene, 'scene_id'>> & { scene_id: string }): Scene => {
  const base: Scene = {
    scene_id: overrides.scene_id,
    description: 'Default scene description',
    description_ru: 'Default scene description',
    description_en: null,
    duration_sec: 5,
    dialogue: null,
    character_ids: [],
    composition: null,
    camera_movement: null,
    lighting: null,
    audio_direction: null,
    arc_role: null,
    tier_at_gen: null,
    audio_mode: 'auto',
    first_frame_source: 'auto_continuity',
    first_frame_versions: [],
    first_frame_active_version_id: null,
    video_versions: [],
    video_active_version_id: null,
    voice_audio_versions: [],
    voice_audio_active_version_id: null,
    last_frame: null,
    final_clip: null,
  };
  return { ...base, ...overrides };
};

const mkChar = (
  overrides: Partial<Omit<Character, 'id' | 'name'>> & { id: string; name: string },
): Character => {
  const base: Character = {
    id: overrides.id,
    name: overrides.name,
    description: 'Default character description',
    full_prompt: '',
    appearance: {},
    voice: {},
    dossier: null,
    reference_images: [],
  };
  return { ...base, ...overrides };
};

// A version entry stub
const mkVersion = (id: string): SceneAssetVersion => ({
  version_id: id,
  generated_at: '2026-01-01T00:00:00Z',
  model: 'test-model',
  storage: { kind: 'fal_passthrough' as const, url: 'https://example.com/x.jpg' },
  prompt: null,
  cost_usd: null,
  source: 'auto_continuity',
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('formatProjectStateSummary', () => {
  // 1. Basic case: 2 active + 1 archived + 2 scenes with mixed media states
  it('basic case — produces all three sections', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        title: 'Test Script',
        tier: 'economy',
        scenes: [
          mkScene({
            scene_id: 'scene-01',
            description: 'Hook scene at the beach',
            arc_role: 'hook',
            duration_sec: 5,
            first_frame_versions: [mkVersion('ff1')],
          }),
          mkScene({
            scene_id: 'scene-02',
            description: 'Rising action meeting',
            arc_role: 'rising',
            duration_sec: 8,
            first_frame_versions: [mkVersion('ff2')],
            video_versions: [mkVersion('v2')],
            voice_audio_versions: [mkVersion('a2')],
          }),
        ],
        characters: [
          mkChar({ id: 'c1', name: 'Кот', description: 'серый домашний кот' }),
          mkChar({ id: 'c2', name: 'Пёс', description: 'большой лабрадор' }),
          mkChar({
            id: 'c_old1',
            name: 'Старый Кот',
            description: 'архивированный',
            archived: true,
          }),
        ],
      },
    };

    const result = formatProjectStateSummary(input);

    // characters_active block present with 2 rows
    expect(result).toContain('<characters_active>');
    expect(result).toContain('</characters_active>');
    const activeBlock =
      result.match(/<characters_active>([\s\S]*?)<\/characters_active>/)?.[1] ?? '';
    const activeLines = activeBlock.trim().split('\n').filter(Boolean);
    expect(activeLines).toHaveLength(2);

    // characters_archived block present with 1 row
    expect(result).toContain('<characters_archived>');
    expect(result).toContain('</characters_archived>');
    const archivedBlock =
      result.match(/<characters_archived>([\s\S]*?)<\/characters_archived>/)?.[1] ?? '';
    const archivedLines = archivedBlock.trim().split('\n').filter(Boolean);
    expect(archivedLines).toHaveLength(1);

    // scenes_summary block present with 2 rows
    expect(result).toContain('<scenes_summary>');
    expect(result).toContain('</scenes_summary>');
    const scenesBlock = result.match(/<scenes_summary>([\s\S]*?)<\/scenes_summary>/)?.[1] ?? '';
    const scenesLines = scenesBlock.trim().split('\n').filter(Boolean);
    expect(scenesLines).toHaveLength(2);
  });

  // 2. No archived characters → archived block absent
  it('no archived characters → characters_archived block absent', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [mkScene({ scene_id: 's1' })],
        characters: [mkChar({ id: 'c1', name: 'Кот' })],
      },
    };
    const result = formatProjectStateSummary(input);
    expect(result.includes('<characters_archived>')).toBe(false);
  });

  // 3. Zero scenes → empty scenes block
  it('zero scenes → empty scenes_summary block', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [],
        characters: [mkChar({ id: 'c1', name: 'Кот' })],
      },
    };
    const result = formatProjectStateSummary(input);
    expect(result).toContain('<scenes_summary>');
    expect(result).toContain('</scenes_summary>');
    const scenesBlock = result.match(/<scenes_summary>([\s\S]*?)<\/scenes_summary>/)?.[1] ?? '';
    const scenesLines = scenesBlock.trim().split('\n').filter(Boolean);
    expect(scenesLines).toHaveLength(0);
  });

  // 4. Zero active characters → empty active block
  it('zero active characters → empty characters_active block', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [],
        characters: [],
      },
    };
    const result = formatProjectStateSummary(input);
    expect(result).toContain('<characters_active>');
    expect(result).toContain('</characters_active>');
    const activeBlock =
      result.match(/<characters_active>([\s\S]*?)<\/characters_active>/)?.[1] ?? '';
    const activeLines = activeBlock.trim().split('\n').filter(Boolean);
    expect(activeLines).toHaveLength(0);
  });

  // 5. Description truncation — 100 char scene description → ellipsis + short
  it('scene description truncation — long description gets truncated with ellipsis', () => {
    const longDesc = 'A'.repeat(100);
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [mkScene({ scene_id: 's1', description: longDesc })],
        characters: [],
      },
    };
    const result = formatProjectStateSummary(input);
    expect(result).toContain('…'); // U+2026 ellipsis
    const scenesBlock = result.match(/<scenes_summary>([\s\S]*?)<\/scenes_summary>/)?.[1] ?? '';
    const line = scenesBlock.trim().split('\n')[0] ?? '';
    // The description part (after last pipe) should be under 60 chars + quotes
    const descPart = line.split('|').pop()?.trim() ?? '';
    expect(descPart.length).toBeLessThan(65);
  });

  // 6/7/8. Voice label lookup — post-2026-05-13 the ElevenLabs pool is gone
  // and every character voice is now rendered by the video model natively.
  // Director state summary just reports presence/absence: "native" if a
  // tts_voice_id is set on the legacy field, "unset" otherwise.
  it('voice label — any tts_voice_id (legacy or fresh) renders "native"', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [],
        characters: [mkChar({ id: 'c1', name: 'Кот', voice: { tts_voice_id: 'some-legacy-id' } })],
      },
    };
    const result = formatProjectStateSummary(input);
    expect(result).toContain('voice=native');
  });

  it('voice label — character without voice block renders "unset"', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [],
        characters: [mkChar({ id: 'c1', name: 'Кот', voice: {} })],
      },
    };
    const result = formatProjectStateSummary(input);
    expect(result).toContain('voice=unset');
  });

  // 9. Media flags exhaustive — all 4 set → all ✓; none → all ✗
  it('media flags — all versions set → all ✓', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [
          mkScene({
            scene_id: 's1',
            first_frame_versions: [mkVersion('ff1')],
            video_versions: [mkVersion('v1')],
            voice_audio_versions: [mkVersion('a1')],
            final_clip: {
              storage: { kind: 'fal_passthrough', url: 'https://example.com/x.mp4' },
              composed_from: { video_version_id: 'v1', voice_audio_version_id: null },
            },
          }),
        ],
        characters: [],
      },
    };
    const result = formatProjectStateSummary(input);
    // Codex audit P2: aud / fc flags retired alongside the audio chain. The
    // Director should no longer see "audio missing" signals contradicting
    // rule 10's "no voice tools" instruction.
    expect(result).toContain('ff✓ vid✓');
    expect(result).not.toContain('aud');
    expect(result).not.toContain('fc');
  });

  it('media flags — no versions → all ✗ (only ff + vid axes now)', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [mkScene({ scene_id: 's1' })],
        characters: [],
      },
    };
    const result = formatProjectStateSummary(input);
    expect(result).toContain('ff✗ vid✗');
    expect(result).not.toContain('aud');
    expect(result).not.toContain('fc');
  });

  // 10. arc_role padding — multiple scenes align visually
  it('arc_role padding — all arc_role columns are padded to the same width', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [
          mkScene({ scene_id: 's1', arc_role: 'hook', duration_sec: 5 }),
          mkScene({ scene_id: 's2', arc_role: 'rising', duration_sec: 8 }),
          mkScene({ scene_id: 's3', arc_role: 'climax', duration_sec: 10 }),
        ],
        characters: [],
      },
    };
    const result = formatProjectStateSummary(input);
    const scenesBlock = result.match(/<scenes_summary>([\s\S]*?)<\/scenes_summary>/)?.[1] ?? '';
    const lines = scenesBlock.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    // Extract the arc_role field (3rd column, after scene_id | duration | arc_role)
    const arcCols = lines.map((l) => {
      const parts = l.split('|');
      return parts[2] ?? '';
    });
    // All should have the same trimmed + padded length
    const lengths = arcCols.map((c) => c.length);
    expect(new Set(lengths).size).toBe(1);
  });

  // 11. Determinism — same input → same output twice
  it('determinism — same input produces identical output', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        title: 'Determinism Test',
        scenes: [
          mkScene({ scene_id: 's1', arc_role: 'hook' }),
          mkScene({ scene_id: 's2', arc_role: 'climax' }),
        ],
        characters: [mkChar({ id: 'c1', name: 'Кот' })],
      },
    };
    const r1 = formatProjectStateSummary(input);
    const r2 = formatProjectStateSummary(input);
    expect(r1).toBe(r2);
  });

  // 12. description_en preferred over description when present
  it('description_en preferred over description when present', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [
          mkScene({
            scene_id: 's1',
            description: 'Русское описание',
            description_en: 'English description',
          }),
        ],
        characters: [],
      },
    };
    const result = formatProjectStateSummary(input);
    expect(result).toContain('English description');
    expect(result).not.toContain('Русское описание');
  });

  // 13. Russian description survives — Cyrillic renders correctly
  it('Russian description survives — Cyrillic text renders in output', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [
          mkScene({
            scene_id: 's1',
            description: 'Кот прыгает на подоконник',
            description_en: null,
          }),
        ],
        characters: [],
      },
    };
    const result = formatProjectStateSummary(input);
    expect(result).toContain('Кот прыгает на подоконник');
  });

  // Bonus: dossier flag
  it('dossier flag — character with dossier shows dossier=true', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [],
        characters: [
          mkChar({
            id: 'c1',
            name: 'Кот',
            dossier: {
              storage: { kind: 'fal_passthrough', url: 'https://example.com/d.jpg' },
              model: 'test-model',
              format: '16:9',
              quality: '720p',
              generated_at: '2026-01-01T00:00:00Z',
            },
          }),
        ],
      },
    };
    const result = formatProjectStateSummary(input);
    expect(result).toContain('dossier=true');
  });

  it('dossier flag — character without dossier shows dossier=false', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [],
        characters: [mkChar({ id: 'c1', name: 'Кот', dossier: null })],
      },
    };
    const result = formatProjectStateSummary(input);
    expect(result).toContain('dossier=false');
  });

  // Bonus: arc_role missing → ??? placeholder
  it('arc_role missing → ??? placeholder padded', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [mkScene({ scene_id: 's1', arc_role: null })],
        characters: [],
      },
    };
    const result = formatProjectStateSummary(input);
    expect(result).toContain('???');
  });

  // Bonus: archived character row format
  it('archived character row contains name and архивирован', () => {
    const input: DirectorStateSummaryInput = {
      script: {
        scenes: [],
        characters: [mkChar({ id: 'c_old', name: 'Старый Кот', archived: true })],
      },
    };
    const result = formatProjectStateSummary(input);
    expect(result).toContain('<characters_archived>');
    expect(result).toContain('Старый Кот');
    expect(result).toContain('архивирован');
  });
});
