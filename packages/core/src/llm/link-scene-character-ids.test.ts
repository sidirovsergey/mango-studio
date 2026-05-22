import { describe, expect, it } from 'vitest';
import { linkSceneCharacterIds } from './link-scene-character-ids';
import type { Character, Scene } from './provider';

// crypto.randomUUID()-style UUIDs (lowercase v4) so isUuid() accepts them.
const UUID_FINN = '7c7c5f3a-1234-4abc-9def-abcdef012345';
const UUID_OCTO = '11223344-5566-4788-99aa-bbccddeeff00';

/** Minimal Scene factory — only the fields the helper reads. */
function mkScene(scene_id: string, character_ids: string[]): Scene {
  return {
    scene_id,
    description: 'test',
    description_ru: 'test',
    duration_sec: 5,
    dialogue: null,
    character_ids,
    first_frame_source: 'auto_continuity',
    first_frame: null,
    last_frame: null,
    video: null,
    voice_audio: null,
    final_clip: null,
  } as Scene;
}

function mkCharacter(id: string, name: string): Character {
  return {
    id,
    name,
    description: 'test',
    full_prompt: '',
    appearance: {},
    personality: '',
    voice: {},
    reference_images: [],
    archived: false,
  } as Character;
}

describe('linkSceneCharacterIds', () => {
  it('replaces a single name with the matching UUID', () => {
    const scenes = [mkScene('s1', ['Финн'])];
    const chars = [mkCharacter(UUID_FINN, 'Финн')];
    const { scenes: linked, warnings } = linkSceneCharacterIds(scenes, chars);
    expect(linked[0]?.character_ids).toEqual([UUID_FINN]);
    expect(warnings).toEqual([]);
  });

  it('passes through valid UUID entries unchanged', () => {
    const scenes = [mkScene('s1', [UUID_FINN])];
    const chars = [mkCharacter(UUID_FINN, 'Финн')];
    const { scenes: linked, warnings } = linkSceneCharacterIds(scenes, chars);
    expect(linked[0]?.character_ids).toEqual([UUID_FINN]);
    expect(warnings).toEqual([]);
  });

  it('handles mixed name + UUID entries idempotently', () => {
    const scenes = [mkScene('s1', ['Финн', UUID_OCTO])];
    const chars = [mkCharacter(UUID_FINN, 'Финн'), mkCharacter(UUID_OCTO, 'Осьминог')];
    const { scenes: linked, warnings } = linkSceneCharacterIds(scenes, chars);
    expect(linked[0]?.character_ids).toEqual([UUID_FINN, UUID_OCTO]);
    expect(warnings).toEqual([]);
  });

  it('drops orphan names with a warning', () => {
    const scenes = [mkScene('s1', ['Финн', 'Барсик'])];
    const chars = [mkCharacter(UUID_FINN, 'Финн')];
    const { scenes: linked, warnings } = linkSceneCharacterIds(scenes, chars);
    expect(linked[0]?.character_ids).toEqual([UUID_FINN]);
    expect(warnings).toEqual([{ scene_id: 's1', entry: 'Барсик', reason: 'orphan_name' }]);
  });

  it('drops orphan UUIDs with a warning (Codex audit round-1 NIT)', () => {
    const orphanUuid = 'deadbeef-1234-4abc-9def-fedcba987654';
    const scenes = [mkScene('s1', [UUID_FINN, orphanUuid])];
    const chars = [mkCharacter(UUID_FINN, 'Финн')];
    const { scenes: linked, warnings } = linkSceneCharacterIds(scenes, chars);
    expect(linked[0]?.character_ids).toEqual([UUID_FINN]);
    expect(warnings).toEqual([{ scene_id: 's1', entry: orphanUuid, reason: 'orphan_uuid' }]);
  });

  it('matches names case-insensitively and trims whitespace', () => {
    const scenes = [mkScene('s1', ['ФИНН']), mkScene('s2', [' финн '])];
    const chars = [mkCharacter(UUID_FINN, 'Финн')];
    const { scenes: linked, warnings } = linkSceneCharacterIds(scenes, chars);
    expect(linked[0]?.character_ids).toEqual([UUID_FINN]);
    expect(linked[1]?.character_ids).toEqual([UUID_FINN]);
    expect(warnings).toEqual([]);
  });

  it('preserves empty character_ids arrays', () => {
    const scenes = [mkScene('s1', [])];
    const chars: Character[] = [];
    const { scenes: linked, warnings } = linkSceneCharacterIds(scenes, chars);
    expect(linked[0]?.character_ids).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('handles two characters sharing a name by taking the first', () => {
    const UUID_FINN_DUPE = 'aaaabbbb-cccc-4ddd-9eee-ffff00001111';
    const scenes = [mkScene('s1', ['Финн'])];
    // First-wins on duplicate-name collisions
    const chars = [mkCharacter(UUID_FINN, 'Финн'), mkCharacter(UUID_FINN_DUPE, 'Финн')];
    const { scenes: linked, warnings } = linkSceneCharacterIds(scenes, chars);
    expect(linked[0]?.character_ids).toEqual([UUID_FINN]);
    expect(warnings).toEqual([]);
  });

  it('does not mutate the input scenes array', () => {
    const original = mkScene('s1', ['Финн']);
    const scenes = [original];
    const chars = [mkCharacter(UUID_FINN, 'Финн')];
    linkSceneCharacterIds(scenes, chars);
    expect(original.character_ids).toEqual(['Финн']);
  });

  it('reports warnings with the correct scene_id when entries fail per-scene', () => {
    const scenes = [mkScene('s1', ['Ghost']), mkScene('s2', ['Финн', 'Phantom'])];
    const chars = [mkCharacter(UUID_FINN, 'Финн')];
    const { warnings } = linkSceneCharacterIds(scenes, chars);
    expect(warnings).toEqual([
      { scene_id: 's1', entry: 'Ghost', reason: 'orphan_name' },
      { scene_id: 's2', entry: 'Phantom', reason: 'orphan_name' },
    ]);
  });
});
