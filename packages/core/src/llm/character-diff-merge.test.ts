import { describe, expect, it, vi } from 'vitest';
import { applyCharacterActions } from './character-diff-merge';
import type { Character, ScriptCharacterAction } from './types';

const mkChar = (id: string, name: string, archived?: boolean): Character => ({
  id,
  name,
  description: '',
  full_prompt: '',
  appearance: {},
  voice: {},
  dossier: null,
  reference_images: [],
  ...(archived ? { archived: true } : {}),
});

const mkCharWithVoice = (
  id: string,
  name: string,
  voiceId: string,
  extra?: Partial<Character>,
): Character => ({
  ...mkChar(id, name),
  voice: { tts_voice_id: voiceId, stability: 0.5 },
  ...extra,
});

describe('applyCharacterActions', () => {
  it('keep — preserve существующих с dossierами', () => {
    const existing = [mkChar('a', 'Alice'), mkChar('b', 'Bob')];
    const actions: ScriptCharacterAction[] = [
      { action: 'keep', id: 'a' },
      { action: 'keep', id: 'b' },
    ];
    const result = applyCharacterActions(existing, actions);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(existing[0]!); // identity preserved
  });

  it('add — append нового с свежим uuid + dossier=null', () => {
    const existing = [mkChar('a', 'Alice')];
    const actions: ScriptCharacterAction[] = [
      { action: 'keep', id: 'a' },
      { action: 'add', name: 'Cat', description: 'a cat', appearance: { species: 'cat' } },
    ];
    const result = applyCharacterActions(existing, actions);
    expect(result).toHaveLength(2);
    expect(result[1]!.name).toBe('Cat');
    expect(result[1]!.dossier).toBeNull();
    expect(result[1]!.id).not.toBe('a');
  });

  it('remove — soft-delete (archived: true), preserve dossier', () => {
    const existing = [
      mkChar('a', 'Alice'),
      {
        ...mkChar('b', 'Bob'),
        dossier: {
          storage: { kind: 'fal_passthrough' as const, url: 'x' },
          model: 'm',
          format: '16:9' as const,
          quality: '1080p' as const,
          generated_at: 'now',
        },
      },
    ];
    const actions: ScriptCharacterAction[] = [
      { action: 'keep', id: 'a' },
      { action: 'remove', id: 'b' },
    ];
    const result = applyCharacterActions(existing, actions);
    expect(result).toHaveLength(2);
    const bob = result.find((c) => c.id === 'b')!;
    expect(bob.archived).toBe(true);
    expect(bob.dossier).not.toBeNull(); // preserved
  });

  it('mix: keep+add+remove одновременно', () => {
    const existing = [mkChar('a', 'Alice'), mkChar('b', 'Bob')];
    const actions: ScriptCharacterAction[] = [
      { action: 'keep', id: 'a' },
      { action: 'remove', id: 'b' },
      { action: 'add', name: 'Cat', description: 'c', appearance: {} },
    ];
    const result = applyCharacterActions(existing, actions);
    expect(result.find((c) => c.id === 'a')?.archived).toBeUndefined();
    expect(result.find((c) => c.id === 'b')?.archived).toBe(true);
    expect(result.find((c) => c.name === 'Cat')).toBeDefined();
  });

  it('keep на несуществующем id — игнорирует', () => {
    const existing = [mkChar('a', 'Alice')];
    const actions: ScriptCharacterAction[] = [
      { action: 'keep', id: 'a' },
      { action: 'keep', id: 'nonexistent' },
    ];
    const result = applyCharacterActions(existing, actions);
    expect(result).toHaveLength(1);
  });

  it('archived characters от прошлых refine не пересоздаются', () => {
    const existing = [mkChar('a', 'Alice'), mkChar('b', 'Bob', true)];
    const actions: ScriptCharacterAction[] = [{ action: 'keep', id: 'a' }];
    const result = applyCharacterActions(existing, actions);
    expect(result).toHaveLength(2);
    expect(result.find((c) => c.id === 'b')?.archived).toBe(true); // archived оставлен
  });
});

describe('applyCharacterActions — voice canary (F37)', () => {
  it('keep action с отсутствующим voice в действии → merge сохраняет prior voice (без предупреждения)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prior = mkCharWithVoice('a', 'Alice', 'voice_abc');
    const existing = [prior];
    const actions: ScriptCharacterAction[] = [{ action: 'keep', id: 'a' }];
    const result = applyCharacterActions(existing, actions);
    expect(result[0]!.voice).toEqual({ tts_voice_id: 'voice_abc', stability: 0.5 });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('keep action с тем же voice → merge сохраняет prior voice (без предупреждения)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prior = mkCharWithVoice('a', 'Alice', 'voice_abc');
    const existing = [prior];
    // Build a keep action with a matching voice block (bypass discriminated-union strictness)
    const actions = [
      { action: 'keep' as const, id: 'a', voice: { tts_voice_id: 'voice_abc', stability: 0.5 } },
    ];
    const result = applyCharacterActions(existing, actions as ScriptCharacterAction[]);
    expect(result[0]!.voice).toEqual({ tts_voice_id: 'voice_abc', stability: 0.5 });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('keep action с ДРУГИМ voice в действии → merge СОХРАНЯЕТ prior voice + emits console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prior = mkCharWithVoice('a', 'Alice', 'voice_locked');
    const existing = [prior];
    // Grok returns a keep action with a different voice_id
    const actions = [
      { action: 'keep' as const, id: 'a', voice: { tts_voice_id: 'voice_different' } },
    ];
    const result = applyCharacterActions(existing, actions as ScriptCharacterAction[]);
    // Prior voice must win
    expect(result[0]!.voice).toEqual({ tts_voice_id: 'voice_locked', stability: 0.5 });
    // Canary warning must be emitted
    expect(warnSpy).toHaveBeenCalledOnce();
    const warnMsg = warnSpy.mock.calls[0]![0] as string;
    expect(warnMsg).toContain('voice_locked');
    expect(warnMsg).toContain('voice_different');
    expect(warnMsg).toContain('a'); // character id
    warnSpy.mockRestore();
  });

  it('keep action с изменённым tts_voice_id → prior voice-block (включая settings) побеждает полностью', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prior = mkCharWithVoice('a', 'Alice', 'voice_locked');
    // prior.voice = { tts_voice_id: 'voice_locked', stability: 0.5 }
    const existing = [prior];
    const actions = [
      {
        action: 'keep' as const,
        id: 'a',
        voice: { tts_voice_id: 'voice_other', stability: 0.8, similarity_boost: 0.9 },
      },
    ];
    const result = applyCharacterActions(existing, actions as ScriptCharacterAction[]);
    // The entire prior voice block wins — including stability, NOT Grok's 0.8
    expect(result[0]!.voice).toEqual({ tts_voice_id: 'voice_locked', stability: 0.5 });
    expect(result[0]!.voice?.stability).toBe(0.5);
    expect((result[0]!.voice as Record<string, unknown>)?.similarity_boost).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('add action НЕ блокирует voice — новый персонаж получает пустой voice объект', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const existing: Character[] = [];
    const actions: ScriptCharacterAction[] = [
      { action: 'add', name: 'Bob', description: 'new character', appearance: {} },
    ];
    const result = applyCharacterActions(existing, actions);
    expect(result[0]!.voice).toEqual({});
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
