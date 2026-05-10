import { describe, expect, it } from 'vitest';
import { resolveAudioMode, resolveVoiceId } from './audio-mode';
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
