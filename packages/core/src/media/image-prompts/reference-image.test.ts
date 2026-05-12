import { describe, expect, it } from 'vitest';
import { buildReferenceImagePrompt } from './reference-image';

const baseChar = {
  name: 'Danny',
  description: 'An optimistic young dolphin with round glasses',
  appearance: {
    species: 'dolphin',
    age: '8',
    distinctive: ['freckles', 'round glasses'],
  },
};

const cyrillicChar = {
  name: 'Дэнни',
  description: 'Оптимистичный молодой дельфин в круглых очках',
  appearance: {
    species: 'дельфин',
    age: '8 лет',
    distinctive: ['веснушки', 'круглые очки'],
  },
};

const charWithFullPrompt = {
  ...baseChar,
  full_prompt: 'A blue 3D Pixar dolphin character wearing a red bowtie, large expressive eyes',
};

describe('buildReferenceImagePrompt', () => {
  it('returns a single string (not an object)', () => {
    const out = buildReferenceImagePrompt(baseChar, '3d_pixar');
    expect(typeof out).toBe('string');
  });

  it('character name appears in the opening line', () => {
    const out = buildReferenceImagePrompt(baseChar, '3d_pixar');
    const firstLine = out.split('\n')[0];
    expect(firstLine).toContain('Danny');
  });

  it('style preamble is resolved to rich human-readable description (not raw enum)', () => {
    // Updated: buildReferenceImagePrompt now uses STYLE_PREAMBLE[style] for richer steering (F58 alignment).
    const out3d = buildReferenceImagePrompt(baseChar, '3d_pixar');
    expect(out3d).toContain('Pixar');
    expect(out3d).not.toContain('Style: 3d_pixar');

    const out2d = buildReferenceImagePrompt(baseChar, '2d_drawn');
    expect(out2d).toContain('Ghibli');
    expect(out2d).not.toContain('Style: 2d_drawn');

    const outClay = buildReferenceImagePrompt(baseChar, 'clay_art');
    expect(outClay).toContain('Aardman');
    expect(outClay).not.toContain('Style: clay_art');
  });

  it('char.description appears verbatim in output', () => {
    const out = buildReferenceImagePrompt(baseChar, '3d_pixar');
    expect(out).toContain('An optimistic young dolphin with round glasses');
  });

  it('char.full_prompt appears when set', () => {
    const out = buildReferenceImagePrompt(charWithFullPrompt, '3d_pixar');
    expect(out).toContain('A blue 3D Pixar dolphin character wearing a red bowtie');
  });

  it('no undefined artifact when full_prompt is absent', () => {
    const out = buildReferenceImagePrompt(baseChar, '3d_pixar');
    expect(out).not.toContain('undefined');
  });

  it('Avoid: line present with required terms', () => {
    const out = buildReferenceImagePrompt(baseChar, '3d_pixar');
    expect(out).toContain('Avoid:');
    expect(out).toContain('text in image');
    expect(out).toContain('panels');
    expect(out).toContain('captions');
    expect(out).toContain('multiple views');
    expect(out).toContain('watermarks');
  });

  it('contains 1:1 or square reference', () => {
    const out = buildReferenceImagePrompt(baseChar, '3d_pixar');
    const has1to1 = out.includes('1:1');
    const hasSquare = out.toLowerCase().includes('square');
    expect(has1to1 || hasSquare).toBe(true);
  });

  it('contains pure white background reference', () => {
    const out = buildReferenceImagePrompt(baseChar, '3d_pixar');
    const hasPureWhite = out.toLowerCase().includes('pure white');
    const hasSeamlessWhite =
      out.toLowerCase().includes('seamless white') || out.toLowerCase().includes('white seamless');
    expect(hasPureWhite || hasSeamlessWhite).toBe(true);
  });

  it('contains full-body or 3/4 AND hands visible', () => {
    const out = buildReferenceImagePrompt(baseChar, '3d_pixar');
    const hasFullBody =
      out.toLowerCase().includes('full-body') || out.toLowerCase().includes('full body');
    const has34 = out.includes('3/4');
    expect(hasFullBody || has34).toBe(true);
    expect(out.toLowerCase()).toContain('hands visible');
  });

  it('contains neutral A-pose or relaxed standing pose', () => {
    const out = buildReferenceImagePrompt(baseChar, '3d_pixar');
    const hasAPose = out.toLowerCase().includes('a-pose') || out.toLowerCase().includes('a pose');
    const hasRelaxedStanding = out.toLowerCase().includes('relaxed standing');
    expect(hasAPose || hasRelaxedStanding).toBe(true);
  });

  it('no composition_hint mention', () => {
    const out = buildReferenceImagePrompt(baseChar, '3d_pixar');
    expect(out).not.toContain('composition_hint');
  });

  it('no "DO NOT replicate" phrase (that is first-frame territory)', () => {
    const out = buildReferenceImagePrompt(baseChar, '3d_pixar');
    expect(out).not.toContain('DO NOT replicate');
  });

  it('no undefined string artifact', () => {
    const out = buildReferenceImagePrompt(baseChar, '3d_pixar');
    expect(out).not.toContain('undefined');
  });

  it('Cyrillic description passthrough — Russian description preserved verbatim', () => {
    const out = buildReferenceImagePrompt(cyrillicChar, '3d_pixar');
    expect(out).toContain('Оптимистичный молодой дельфин в круглых очках');
    // Structural directives must remain English
    expect(out).toContain('Avoid:');
    expect(out).toContain('Pure white background');
  });
});
