import { describe, expect, it } from 'vitest';
import { SceneSchema } from '../schemas';
import { REFINE_EXAMPLES } from './refine-scene';

describe('REFINE_EXAMPLES', () => {
  it('exports both tone_change and composition_change', () => {
    expect(REFINE_EXAMPLES.tone_change).toBeTypeOf('string');
    expect(REFINE_EXAMPLES.composition_change).toBeTypeOf('string');
    expect(REFINE_EXAMPLES.tone_change).toContain('<example>');
    expect(REFINE_EXAMPLES.tone_change).toContain('сделай страшнее');
    expect(REFINE_EXAMPLES.composition_change).toContain('extreme close-up');
  });

  it('tone_change example contains <input> and <output> blocks', () => {
    expect(REFINE_EXAMPLES.tone_change).toContain('<input>');
    expect(REFINE_EXAMPLES.tone_change).toContain('</input>');
    expect(REFINE_EXAMPLES.tone_change).toContain('<output>');
    expect(REFINE_EXAMPLES.tone_change).toContain('</output>');
    expect(REFINE_EXAMPLES.tone_change).toContain('</example>');
  });

  it('composition_change example contains <input> and <output> blocks', () => {
    expect(REFINE_EXAMPLES.composition_change).toContain('<input>');
    expect(REFINE_EXAMPLES.composition_change).toContain('</input>');
    expect(REFINE_EXAMPLES.composition_change).toContain('<output>');
    expect(REFINE_EXAMPLES.composition_change).toContain('</output>');
    expect(REFINE_EXAMPLES.composition_change).toContain('</example>');
  });

  it('tone_change output parses via SceneSchema with changed fields', () => {
    // Extract the <output>...</output> JSON from the tone_change example
    const match = REFINE_EXAMPLES.tone_change.match(/<output>\s*([\s\S]*?)\s*<\/output>/);
    expect(match).not.toBeNull();
    const outputJson = match![1].trim();
    const parsed = SceneSchema.parse(JSON.parse(outputJson));

    // Changed fields: description, lighting, audio_direction
    expect(parsed.description).toContain('ночную тьму');
    expect(parsed.lighting?.recipe).toBe('moonlit rim + deep shadow fill');
    expect(parsed.lighting?.time_of_day).toBe('ночь');
    expect(parsed.audio_direction?.ambient).toContain('ветра');
    expect(parsed.audio_direction?.music).toContain('струнный дрон');

    // Preserved fields: composition + camera_movement unchanged
    expect(parsed.composition?.shot_size).toBe('medium');
    expect(parsed.composition?.angle).toBe('eye_level');
    expect(parsed.camera_movement?.kind).toBe('static');
  });

  it('composition_change output parses via SceneSchema with only shot_size changed', () => {
    const match = REFINE_EXAMPLES.composition_change.match(/<output>\s*([\s\S]*?)\s*<\/output>/);
    expect(match).not.toBeNull();
    const outputJson = match![1].trim();
    const parsed = SceneSchema.parse(JSON.parse(outputJson));

    // Changed field: composition.shot_size
    expect(parsed.composition?.shot_size).toBe('extreme_close_up');

    // Preserved fields: everything else unchanged from input
    expect(parsed.composition?.angle).toBe('eye_level');
    expect(parsed.camera_movement?.kind).toBe('static');
    expect(parsed.lighting?.recipe).toBe('warm fill');
    expect(parsed.audio_direction?.ambient).toContain('часов');
    expect(parsed.description).toContain('пустую миску');
  });
});
