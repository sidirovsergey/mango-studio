import { describe, expect, it } from 'vitest';
import { resolveAudioMode, resolveVoiceId, resolveVoiceSettings } from './audio-mode';
import { VOICE_POOL } from './voices';

describe('resolveAudioMode', () => {
  const native = { has_native_audio: true };
  const silent = { has_native_audio: false };

  it('returns native when explicit', () => {
    expect(
      resolveAudioMode(
        { audio_mode: 'native', dialogue: { speaker: 'narrator', text: 'hello' } },
        native,
      ),
    ).toBe('native');
  });

  it('returns silent_tts when explicit', () => {
    expect(resolveAudioMode({ audio_mode: 'silent_tts', dialogue: null }, native)).toBe(
      'silent_tts',
    );
  });

  it('auto: cyrillic → silent_tts', () => {
    expect(
      resolveAudioMode(
        { audio_mode: 'auto', dialogue: { speaker: 'narrator', text: 'Привет!' } },
        native,
      ),
    ).toBe('silent_tts');
  });

  it('auto: latin + native model → native', () => {
    expect(
      resolveAudioMode(
        { audio_mode: 'auto', dialogue: { speaker: 'narrator', text: 'Hello' } },
        native,
      ),
    ).toBe('native');
  });

  it('auto: latin + silent model → silent_tts', () => {
    expect(
      resolveAudioMode(
        { audio_mode: 'auto', dialogue: { speaker: 'narrator', text: 'Hello' } },
        silent,
      ),
    ).toBe('silent_tts');
  });

  it('auto: empty dialogue + silent → silent_tts (no audio at all)', () => {
    expect(resolveAudioMode({ audio_mode: 'auto', dialogue: null }, silent)).toBe('silent_tts');
  });

  it('default audio_mode (undefined) acts as auto', () => {
    expect(resolveAudioMode({ dialogue: { speaker: 'narrator', text: 'Hello' } }, native)).toBe(
      'native',
    );
  });
});

describe('resolveVoiceId', () => {
  const characters = [
    { id: 'c1', name: 'X', voice_id: 'cv1', voice_label: 'L1' },
    { id: 'c2', name: 'Y' /* no voice */ },
  ] as never;

  it('returns narrator voice for narrator speaker (voice_id shape)', () => {
    expect(
      resolveVoiceId('narrator', characters, { voice_id: 'narrator-v', voice_label: 'Rachel' }),
    ).toBe('narrator-v');
  });

  it('returns narrator voice for narrator speaker (tts_voice_id shape)', () => {
    expect(resolveVoiceId('narrator', characters, { tts_voice_id: 'tts-narrator-v' })).toBe(
      'tts-narrator-v',
    );
  });

  it('falls back to VOICE_POOL[0] when narrator missing entirely', () => {
    expect(resolveVoiceId('narrator', characters, undefined)).toBe(VOICE_POOL[0]!.id);
  });

  it('returns character voice when set', () => {
    expect(resolveVoiceId('c1', characters, { tts_voice_id: 'narrator-v' })).toBe('cv1');
  });

  it('falls back to first VOICE_POOL when character has no voice', () => {
    expect(resolveVoiceId('c2', characters, { tts_voice_id: 'narrator-v' })).toBe(
      VOICE_POOL[0]!.id,
    );
  });

  it('falls back to first VOICE_POOL when speaker not found', () => {
    expect(resolveVoiceId('unknown', characters, { tts_voice_id: 'narrator-v' })).toBe(
      VOICE_POOL[0]!.id,
    );
  });
});

describe('resolveVoiceSettings', () => {
  const FALLBACK = { stability: 0.6, similarity_boost: 0.75, style: 0, speed: 1.0 };

  // Characters: c1 has voice_settings, c2 has voice_id only (no per-char settings)
  const characters = [
    {
      id: 'c1',
      name: 'Alice',
      voice_id: VOICE_POOL[1]!.id, // Adam
      voice: { tts_voice_id: VOICE_POOL[1]!.id, stability: 0.3, similarity_boost: 0.5, style: 0.1, speed: 1.2 },
    },
    {
      id: 'c2',
      name: 'Bob',
      voice_id: VOICE_POOL[1]!.id, // Adam — no per-char overrides
      voice: { tts_voice_id: VOICE_POOL[1]!.id },
    },
  ] as never;

  it('uses character voice_settings override when present', () => {
    const result = resolveVoiceSettings('c1', characters, null);
    expect(result).toEqual({ stability: 0.3, similarity_boost: 0.5, style: 0.1, speed: 1.2 });
  });

  it('falls back to pool default when character has no per-char settings', () => {
    // c2.voice has no stability/etc → resolves Adam's pool default
    const result = resolveVoiceSettings('c2', characters, null);
    expect(result).toEqual(VOICE_POOL[1]!.voice_settings_default);
  });

  it('uses narrator voice_settings override when speaker is narrator', () => {
    const narrator = {
      tts_voice_id: VOICE_POOL[0]!.id,
      stability: 0.8,
      similarity_boost: 0.9,
      style: 0.2,
      speed: 0.8,
    };
    const result = resolveVoiceSettings('narrator', [], narrator);
    expect(result).toEqual({ stability: 0.8, similarity_boost: 0.9, style: 0.2, speed: 0.8 });
  });

  it('falls back to pool default when narrator has no voice_settings', () => {
    const narrator = { tts_voice_id: VOICE_POOL[0]!.id };
    const result = resolveVoiceSettings('narrator', [], narrator);
    expect(result).toEqual(VOICE_POOL[0]!.voice_settings_default);
  });

  it('falls back to narrator-default constant when voice_id not in pool', () => {
    const narrator = { tts_voice_id: 'custom-voice-not-in-pool' };
    const result = resolveVoiceSettings('narrator', [], narrator);
    expect(result).toEqual(FALLBACK);
  });

  it('falls back to narrator-default constant when character voice_id not in pool', () => {
    const unknownChars = [
      { id: 'cx', name: 'X', voice_id: 'custom-not-in-pool', voice: { tts_voice_id: 'custom-not-in-pool' } },
    ] as never;
    const result = resolveVoiceSettings('cx', unknownChars, null);
    expect(result).toEqual(FALLBACK);
  });
});
