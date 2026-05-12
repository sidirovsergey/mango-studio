/**
 * Tests for Phase-1.3.5 → 1.4 migration helpers.
 * Fixtures are hand-authored sanitized Phase-1.3.5 shapes (no real user data).
 */
import { describe, expect, it } from 'vitest';
import { VOICE_ID_REMAP, downgradeScript_1_4, upgradeScript_1_4 } from './migration-1.4';

// ---------------------------------------------------------------------------
// Fixture 1: 15s economy script, 1 character (cat), narrator has Rachel voice
// ---------------------------------------------------------------------------
const fixture1 = {
  title: 'Котёнок и клубок',
  narrator_voice: {
    tts_voice_id: '21m00Tcm4TlvDq8ikWAM', // Rachel — should remap to Janet
    description: 'тёплый женский',
  },
  characters: [
    {
      action: 'keep',
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      name: 'Кот Мурзик',
      description: 'Рыжий полосатый котёнок',
      appearance: { species: 'кот', distinctive: ['рыжий', 'полосатый'] },
      personality: 'игривый',
      voice: {
        tts_voice_id: '21m00Tcm4TlvDq8ikWAM', // Rachel — should remap
        description: 'мягкий женский', // should be dropped
      },
      dossier: null,
      reference_images: [],
    },
  ],
  scenes: [
    {
      scene_id: 'scene-001',
      description: 'Котёнок играет с клубком ниток у камина.',
      dialogue: null,
      character_ids: ['aaaaaaaa-0000-0000-0000-000000000001'],
      duration_sec: 5,
      first_frame_source: 'auto_continuity',
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: [],
      video_active_version_id: null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      audio_mode: 'auto',
      last_frame: null,
      final_clip: null,
    },
    {
      scene_id: 'scene-002',
      description: 'Клубок закатывается под диван.',
      dialogue: null,
      character_ids: ['aaaaaaaa-0000-0000-0000-000000000001'],
      duration_sec: 5,
      first_frame_source: 'auto_continuity',
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: [],
      video_active_version_id: null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      audio_mode: 'auto',
      last_frame: null,
      final_clip: null,
    },
    {
      scene_id: 'scene-003',
      description: 'Котёнок удивлённо смотрит под диван.',
      dialogue: null,
      character_ids: ['aaaaaaaa-0000-0000-0000-000000000001'],
      duration_sec: 5,
      first_frame_source: 'auto_continuity',
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: [],
      video_active_version_id: null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      audio_mode: 'auto',
      last_frame: null,
      final_clip: null,
    },
  ],
  master_clip_versions: [],
  master_clip_active_version_id: null,
};

// ---------------------------------------------------------------------------
// Fixture 2: 60s premium script, 2 characters — Adam (kept) + Antoni (→ George)
// ---------------------------------------------------------------------------
const fixture2 = {
  title: 'Приключения в лесу',
  narrator_voice: {
    tts_voice_id: 'pNInz6obpgDQGcFmaJgB', // Adam — kept
  },
  characters: [
    {
      action: 'keep',
      id: 'bbbbbbbb-0000-0000-0000-000000000001',
      name: 'Лесник Иван',
      description: 'Седобородый лесник',
      appearance: { age: '60', build: 'коренастый' },
      personality: 'мудрый',
      voice: {
        tts_voice_id: 'pNInz6obpgDQGcFmaJgB', // Adam — should remain unchanged
      },
      dossier: null,
      reference_images: [],
    },
    {
      action: 'keep',
      id: 'bbbbbbbb-0000-0000-0000-000000000002',
      name: 'Зайчонок Тимка',
      description: 'Маленький серый зайчонок',
      appearance: { species: 'заяц', age: 'детёныш' },
      personality: 'трусливый но добрый',
      voice: {
        tts_voice_id: 'ErXwobaYiN019PkySvjV', // Antoni — should remap to George
        description: 'молодой нежный', // should be dropped
      },
      dossier: null,
      reference_images: [],
    },
  ],
  scenes: Array.from({ length: 10 }, (_, i) => ({
    scene_id: `scene-${String(i + 1).padStart(3, '0')}`,
    description: `Сцена ${i + 1} из приключений в лесу.`,
    dialogue: null,
    character_ids: ['bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002'],
    duration_sec: 6,
    first_frame_source: 'auto_continuity',
    first_frame_versions: [],
    first_frame_active_version_id: null,
    video_versions: [],
    video_active_version_id: null,
    voice_audio_versions: [],
    voice_audio_active_version_id: null,
    audio_mode: 'auto',
    last_frame: null,
    final_clip: null,
  })),
  master_clip_versions: [],
  master_clip_active_version_id: null,
};

// ---------------------------------------------------------------------------
// Fixture 3: minimal script — no voice block on characters (defensive)
// ---------------------------------------------------------------------------
const fixture3 = {
  title: 'Без голоса',
  narrator_voice: undefined,
  characters: [
    {
      action: 'keep',
      id: 'cccccccc-0000-0000-0000-000000000001',
      name: 'Молчун',
      description: 'Персонаж без голоса',
      appearance: {},
      personality: undefined,
      // no voice block
      dossier: null,
      reference_images: [],
    },
  ],
  scenes: [
    {
      scene_id: 'scene-001',
      description: 'Молчаливая сцена.',
      dialogue: null,
      character_ids: ['cccccccc-0000-0000-0000-000000000001'],
      duration_sec: 5,
      first_frame_source: 'auto_continuity',
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: [],
      video_active_version_id: null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      audio_mode: 'auto',
      last_frame: null,
      final_clip: null,
    },
    {
      scene_id: 'scene-002',
      description: 'Ещё одна тихая сцена.',
      dialogue: null,
      character_ids: [],
      duration_sec: 5,
      first_frame_source: 'auto_continuity',
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: [],
      video_active_version_id: null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      audio_mode: 'auto',
      last_frame: null,
      final_clip: null,
    },
  ],
  master_clip_versions: [],
  master_clip_active_version_id: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('upgradeScript_1_4 — fixture 1 (economy, 1 char, Rachel voice)', () => {
  const { upgraded, stats } = upgradeScript_1_4(fixture1, { project_tier: 'economy' });

  it('sets description_en = null on each scene', () => {
    for (const scene of upgraded.scenes) {
      expect(scene.description_en).toBeNull();
    }
  });

  it('sets visual_theme = null at script root', () => {
    expect(upgraded.visual_theme).toBeNull();
  });

  it('sets tier = "economy" at script root', () => {
    expect(upgraded.tier).toBe('economy');
  });

  it('sets tier_at_gen = "economy" on each scene', () => {
    for (const scene of upgraded.scenes) {
      expect(scene.tier_at_gen).toBe('economy');
    }
  });

  it('sets description_ru from description', () => {
    expect(upgraded.scenes[0]!.description_ru).toBe(fixture1.scenes[0]!.description);
  });

  it('sets composition/camera_movement/lighting/audio_direction/arc_role = null', () => {
    for (const scene of upgraded.scenes) {
      expect(scene.composition).toBeNull();
      expect(scene.camera_movement).toBeNull();
      expect(scene.lighting).toBeNull();
      expect(scene.audio_direction).toBeNull();
      expect(scene.arc_role).toBeNull();
    }
  });

  it('remaps narrator voice from Rachel to Janet', () => {
    expect(upgraded.narrator_voice?.tts_voice_id).toBe('eLDc7xhWxG2FElT3kUTj');
  });

  it('remaps character voice from Rachel to Janet', () => {
    const char = upgraded.characters[0] as Record<string, unknown>;
    const voice = char.voice as Record<string, unknown>;
    expect(voice?.tts_voice_id).toBe('eLDc7xhWxG2FElT3kUTj');
  });

  it('drops voice.description from character', () => {
    const char = upgraded.characters[0] as Record<string, unknown>;
    const voice = char.voice as Record<string, unknown> | undefined;
    expect(voice).not.toHaveProperty('description');
  });

  it('stats: 1 script, 3 scenes, 1 character, 2 voice_ids_remapped (narrator+char), 1 voice_description_dropped', () => {
    expect(stats.scripts_upgraded).toBe(1);
    expect(stats.scenes_upgraded).toBe(3);
    expect(stats.characters_upgraded).toBe(1);
    expect(stats.voice_ids_remapped).toBe(2); // narrator + character
    expect(stats.voice_description_dropped).toBe(1);
  });
});

describe('upgradeScript_1_4 — fixture 2 (premium, 2 chars, Adam + Antoni)', () => {
  const { upgraded, stats } = upgradeScript_1_4(fixture2, { project_tier: 'premium' });

  it('sets tier = "premium"', () => {
    expect(upgraded.tier).toBe('premium');
  });

  it('keeps Adam voice ID unchanged', () => {
    const char0 = upgraded.characters[0] as Record<string, unknown>;
    const voice0 = char0.voice as Record<string, unknown>;
    expect(voice0?.tts_voice_id).toBe('pNInz6obpgDQGcFmaJgB');
  });

  it('remaps Antoni to George for second character', () => {
    const char1 = upgraded.characters[1] as Record<string, unknown>;
    const voice1 = char1.voice as Record<string, unknown>;
    expect(voice1?.tts_voice_id).toBe('JBFqnCBsd6RMkjVDRZzb');
  });

  it('drops voice.description from second character', () => {
    const char1 = upgraded.characters[1] as Record<string, unknown>;
    const voice1 = char1.voice as Record<string, unknown> | undefined;
    expect(voice1).not.toHaveProperty('description');
  });

  it('stats: 10 scenes, 2 characters, 1 voice_id_remapped (only Antoni), 1 description_dropped', () => {
    expect(stats.scenes_upgraded).toBe(10);
    expect(stats.characters_upgraded).toBe(2);
    expect(stats.voice_ids_remapped).toBe(1); // only Antoni; Adam kept; narrator Adam kept
    expect(stats.voice_description_dropped).toBe(1);
  });
});

describe('upgradeScript_1_4 — fixture 3 (no voice block on characters)', () => {
  it('does not crash when character has no voice block', () => {
    expect(() => upgradeScript_1_4(fixture3)).not.toThrow();
  });

  it('produces valid scene count', () => {
    const { upgraded } = upgradeScript_1_4(fixture3);
    expect(upgraded.scenes).toHaveLength(2);
  });

  it('description_en is null', () => {
    const { upgraded } = upgradeScript_1_4(fixture3);
    expect(upgraded.scenes[0]!.description_en).toBeNull();
  });

  it('no voice_ids_remapped when no voice blocks', () => {
    const { stats } = upgradeScript_1_4(fixture3);
    expect(stats.voice_ids_remapped).toBe(0);
  });
});

describe('upgradeScript_1_4 — voice IDs kept when not in remap', () => {
  it('Adam (pNInz6obpgDQGcFmaJgB) unchanged', () => {
    const script = {
      ...fixture1,
      narrator_voice: { tts_voice_id: 'pNInz6obpgDQGcFmaJgB' },
    };
    const { upgraded, stats } = upgradeScript_1_4(script);
    expect(upgraded.narrator_voice?.tts_voice_id).toBe('pNInz6obpgDQGcFmaJgB');
    expect(stats.voice_ids_remapped).toBe(1); // only the character's Rachel → Janet
  });

  it('Bella/Sarah (EXAVITQu4vr4xnSDxMaL) unchanged', () => {
    const script = {
      ...fixture1,
      narrator_voice: { tts_voice_id: 'EXAVITQu4vr4xnSDxMaL' },
    };
    const { upgraded } = upgradeScript_1_4(script);
    expect(upgraded.narrator_voice?.tts_voice_id).toBe('EXAVITQu4vr4xnSDxMaL');
  });
});

describe('upgradeScript_1_4 — idempotency', () => {
  it('re-running upgrade on already-1.4 script returns unchanged (zero stats)', () => {
    const { upgraded: first } = upgradeScript_1_4(fixture1, { project_tier: 'economy' });
    const { upgraded: second, stats: secondStats } = upgradeScript_1_4(first as unknown, {
      project_tier: 'economy',
    });

    expect(second.tier).toBe(first.tier);
    expect(second.scenes[0]!.description_en).toBeNull();
    expect(secondStats.scripts_upgraded).toBe(0);
    expect(secondStats.scenes_upgraded).toBe(0);
    expect(secondStats.voice_ids_remapped).toBe(0);
  });
});

describe('downgradeScript_1_4 — round-trip', () => {
  it('downgrade of upgraded fixture1 removes Phase-1.4 scene fields', () => {
    const { upgraded } = upgradeScript_1_4(fixture1, { project_tier: 'economy' });
    const downgraded = downgradeScript_1_4(upgraded) as Record<string, unknown>;
    const scene0 = (downgraded.scenes as Record<string, unknown>[])[0]!;

    expect(scene0).not.toHaveProperty('description_ru');
    expect(scene0).not.toHaveProperty('description_en');
    expect(scene0).not.toHaveProperty('composition');
    expect(scene0).not.toHaveProperty('camera_movement');
    expect(scene0).not.toHaveProperty('lighting');
    expect(scene0).not.toHaveProperty('audio_direction');
    expect(scene0).not.toHaveProperty('arc_role');
    expect(scene0).not.toHaveProperty('tier_at_gen');
  });

  it('downgrade removes visual_theme and tier from script root', () => {
    const { upgraded } = upgradeScript_1_4(fixture1, { project_tier: 'economy' });
    const downgraded = downgradeScript_1_4(upgraded) as Record<string, unknown>;
    expect(downgraded).not.toHaveProperty('visual_theme');
    expect(downgraded).not.toHaveProperty('tier');
  });

  it('downgrade preserves title and scene count', () => {
    const { upgraded } = upgradeScript_1_4(fixture1, { project_tier: 'economy' });
    const downgraded = downgradeScript_1_4(upgraded) as Record<string, unknown>;
    expect(downgraded.title).toBe(fixture1.title);
    expect((downgraded.scenes as unknown[]).length).toBe(fixture1.scenes.length);
  });

  it('voice IDs in downgraded result are NOT reverted to old IDs (by design)', () => {
    // Old IDs are dead in ElevenLabs — restoring would break TTS.
    const { upgraded } = upgradeScript_1_4(fixture1, { project_tier: 'economy' });
    const downgraded = downgradeScript_1_4(upgraded) as Record<string, unknown>;
    const narrator = downgraded.narrator_voice as Record<string, unknown>;
    // Still has the new Janet ID, not the old Rachel ID
    expect(narrator?.tts_voice_id).toBe('eLDc7xhWxG2FElT3kUTj');
    expect(narrator?.tts_voice_id).not.toBe('21m00Tcm4TlvDq8ikWAM');
  });
});

describe('VOICE_ID_REMAP table', () => {
  it('contains exactly the 4 expected replacements', () => {
    expect(VOICE_ID_REMAP['21m00Tcm4TlvDq8ikWAM']).toBe('eLDc7xhWxG2FElT3kUTj'); // Rachel → Janet
    expect(VOICE_ID_REMAP.AZnzlk1XvdvUeBnXmlld).toBe('cgSgspJ2msm6clMCkdW9'); // Domi → Jessica
    expect(VOICE_ID_REMAP.ErXwobaYiN019PkySvjV).toBe('JBFqnCBsd6RMkjVDRZzb'); // Antoni → George
    expect(VOICE_ID_REMAP.VR6AewLTigWG4xSOukaG).toBe('onwK4e9ZLuTAKqWW03F9'); // Arnold → Daniel
    // Adam and Sarah/Bella are NOT in the remap (kept same IDs)
    expect(VOICE_ID_REMAP.pNInz6obpgDQGcFmaJgB).toBeUndefined();
    expect(VOICE_ID_REMAP.EXAVITQu4vr4xnSDxMaL).toBeUndefined();
  });
});
