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
