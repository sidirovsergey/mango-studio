import { describe, expect, it } from 'vitest';
import { DEFAULT_NARRATOR_VOICE_ID, VOICE_POOL, getVoiceById } from './voices';

describe('VOICE_POOL', () => {
  it('contains 5-8 entries', () => {
    expect(VOICE_POOL.length).toBeGreaterThanOrEqual(5);
    expect(VOICE_POOL.length).toBeLessThanOrEqual(8);
  });

  it('every entry has id, label, gender, tone, supports_ru=true', () => {
    for (const v of VOICE_POOL) {
      expect(v.id).toMatch(/^[A-Za-z0-9]{20}$/);
      expect(v.label).toBeTruthy();
      expect(['male', 'female', 'other']).toContain(v.gender);
      expect(v.tone).toBeTruthy();
      expect(v.supports_ru).toBe(true);
    }
  });

  it('has unique ids', () => {
    const ids = VOICE_POOL.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has at least one male and one female', () => {
    expect(VOICE_POOL.some((v) => v.gender === 'male')).toBe(true);
    expect(VOICE_POOL.some((v) => v.gender === 'female')).toBe(true);
  });

  it('VOICE_POOL[0] has voice_settings_default with all 4 fields as numbers', () => {
    const vsd = VOICE_POOL[0]!.voice_settings_default;
    expect(typeof vsd.stability).toBe('number');
    expect(typeof vsd.similarity_boost).toBe('number');
    expect(typeof vsd.style).toBe('number');
    expect(typeof vsd.speed).toBe('number');
  });

  it('every pool entry has voice_settings_default', () => {
    for (const v of VOICE_POOL) {
      expect(v.voice_settings_default).toBeDefined();
      expect(typeof v.voice_settings_default.stability).toBe('number');
      expect(typeof v.voice_settings_default.similarity_boost).toBe('number');
      expect(typeof v.voice_settings_default.style).toBe('number');
      expect(typeof v.voice_settings_default.speed).toBe('number');
    }
  });

  it('per-position voice_settings_default matches spec table', () => {
    // Position 0: Janet (narrator default) — was Rachel (MISSING F29)
    expect(VOICE_POOL[0]!.voice_settings_default).toEqual({
      stability: 0.6,
      similarity_boost: 0.75,
      style: 0,
      speed: 1.0,
    });
    // Position 1: Adam (male уверенный) — id kept, label unchanged
    expect(VOICE_POOL[1]!.voice_settings_default).toEqual({
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      speed: 1.0,
    });
    // Position 2: Jessica (female young) — was Domi (MISSING F29)
    expect(VOICE_POOL[2]!.voice_settings_default).toEqual({
      stability: 0.4,
      similarity_boost: 0.7,
      style: 0,
      speed: 1.0,
    });
    // Position 3: Sarah (female soft) — id kept, was Bella (renamed in ElevenLabs F29)
    expect(VOICE_POOL[3]!.voice_settings_default).toEqual({
      stability: 0.55,
      similarity_boost: 0.75,
      style: 0,
      speed: 0.95,
    });
    // Position 4: George (male warm) — was Antoni (MISSING F29)
    expect(VOICE_POOL[4]!.voice_settings_default).toEqual({
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      speed: 1.0,
    });
    // Position 5: Daniel (male serious) — was Arnold (MISSING F29)
    expect(VOICE_POOL[5]!.voice_settings_default).toEqual({
      stability: 0.55,
      similarity_boost: 0.75,
      style: 0,
      speed: 0.95,
    });
  });

  it('all voice_settings_default values are within ElevenLabs valid ranges', () => {
    for (const v of VOICE_POOL) {
      const { stability, similarity_boost, style, speed } = v.voice_settings_default;
      expect(stability).toBeGreaterThanOrEqual(0);
      expect(stability).toBeLessThanOrEqual(1);
      expect(similarity_boost).toBeGreaterThanOrEqual(0);
      expect(similarity_boost).toBeLessThanOrEqual(1);
      expect(style).toBeGreaterThanOrEqual(0);
      expect(style).toBeLessThanOrEqual(1);
      expect(speed).toBeGreaterThanOrEqual(0.7);
      expect(speed).toBeLessThanOrEqual(1.2);
    }
  });
});

describe('getVoiceById', () => {
  it('returns voice for known id', () => {
    const first = VOICE_POOL[0]!;
    expect(getVoiceById(first.id)).toEqual(first);
  });

  it('returns undefined for unknown id', () => {
    expect(getVoiceById('unknown-voice-xxxxxx')).toBeUndefined();
  });
});

describe('DEFAULT_NARRATOR_VOICE_ID', () => {
  it('is set to a 20-char alphanumeric id', () => {
    expect(DEFAULT_NARRATOR_VOICE_ID).toMatch(/^[A-Za-z0-9]{20}$/);
  });
});
