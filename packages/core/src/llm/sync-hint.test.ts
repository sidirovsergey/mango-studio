import { describe, expect, it } from 'vitest';
import { type SyncHintScene, detectSyncHint } from './sync-hint';

const ch = (name: string, description = '') => ({ name, description });
const scene = (description: string): SyncHintScene => ({ description });

describe('detectSyncHint', () => {
  it('returns undefined when no scenes match', () => {
    const r = detectSyncHint(ch('Алиса'), [scene('Кот летит'), scene('Собака бежит')], 'refine');
    expect(r).toBeUndefined();
  });

  it('returns undefined for empty/whitespace name', () => {
    expect(detectSyncHint(ch(''), [scene('Алиса')], 'refine')).toBeUndefined();
    expect(detectSyncHint(ch('   '), [scene('Алиса')], 'refine')).toBeUndefined();
  });

  it('returns hint with single scene match (singular form)', () => {
    const r = detectSyncHint(ch('Алиса'), [scene('Алиса смотрит на закат')], 'refine');
    expect(r?.reason).toBe('Алиса упоминается в сцене 1');
    expect(r?.status).toBe('visible');
  });

  it('returns hint with multiple scene matches (plural form, indices)', () => {
    const r = detectSyncHint(
      ch('Алиса'),
      [scene('Алиса просыпается'), scene('Кот мяукает'), scene('Алиса находит карту')],
      'refine',
    );
    expect(r?.reason).toBe('Алиса упоминается в сценах 1, 3');
  });

  it('case-insensitive substring match', () => {
    const r = detectSyncHint(ch('Алиса'), [scene('АЛИСА в углу')], 'refine');
    expect(r).toBeDefined();
  });

  it('builds different suggested_instruction per kind', () => {
    const c = ch('Алиса', 'мечтательная');
    const scenes = [scene('Алиса гуляет')];
    const refine = detectSyncHint(c, scenes, 'refine');
    const archive = detectSyncHint(c, scenes, 'archive');
    const unarchive = detectSyncHint(c, scenes, 'unarchive');
    expect(refine?.suggested_instruction).toMatch(/учл/i);
    expect(refine?.suggested_instruction).toContain('мечтательная');
    expect(archive?.suggested_instruction).toMatch(/удали|убери/i);
    expect(unarchive?.suggested_instruction).toMatch(/верни|восстанови/i);
  });

  it('handles missing description gracefully (refine path)', () => {
    const r = detectSyncHint(ch('Алиса'), [scene('Алиса гуляет')], 'refine');
    expect(r).toBeDefined();
    expect(r?.suggested_instruction).not.toMatch(/:\s*$/); // no trailing colon
  });

  it('non-string scene.description is skipped (defensive)', () => {
    const scenes = [{ description: 123 as unknown as string }, scene('Алиса есть тут')];
    const r = detectSyncHint(ch('Алиса'), scenes, 'refine');
    expect(r?.reason).toBe('Алиса упоминается в сцене 2');
  });
});
