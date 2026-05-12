import { describe, expect, it } from 'vitest';
import { buildAvatarPrompt, buildDossierPrompt } from './prompts';
import type { Style } from './prompts';

const baseChar = {
  name: 'Дэнни',
  description: 'Оптимистичный дельфин',
  appearance: {
    species: 'дельфин',
    age: '8 лет',
    distinctive: ['веснушки', 'круглые очки'],
  },
  personality: 'добрый и любопытный',
};

describe('buildAvatarPrompt', () => {
  it('содержит ключевые слова портрета', () => {
    const out = buildAvatarPrompt(baseChar, '3d_pixar');
    // Updated: English structural directive "Portrait shot" replaced the Russian "Портрет персонажа" line (F55 polish).
    const hasPortraitWord =
      out.toLowerCase().includes('portrait') || out.toLowerCase().includes('портрет');
    expect(hasPortraitWord).toBe(true);
    expect(out.toLowerCase()).toContain('лицо');
    expect(out).toContain('1:1');
  });
  it('инжектит name, description и appearance', () => {
    const out = buildAvatarPrompt(baseChar, '3d_pixar');
    expect(out).toContain('Дэнни');
    expect(out).toContain('Оптимистичный дельфин');
    expect(out).toContain('дельфин');
    expect(out).toContain('веснушки');
  });
  it('применяет стиль 3d_pixar', () => {
    const out = buildAvatarPrompt(baseChar, '3d_pixar');
    expect(out).toMatch(/3D Pixar/i);
  });
  it('применяет стиль 2d_drawn', () => {
    const out = buildAvatarPrompt(baseChar, '2d_drawn');
    expect(out).toMatch(/2D рисованная/i);
  });
  it('применяет стиль clay_art', () => {
    const out = buildAvatarPrompt(baseChar, 'clay_art');
    expect(out).toMatch(/пластилина/i);
  });
  it('опускает personality если её нет', () => {
    const out = buildAvatarPrompt({ ...baseChar, personality: undefined }, '3d_pixar');
    expect(out).not.toMatch(/Характер:/);
  });
  it('не пустой', () => {
    const out = buildAvatarPrompt(baseChar, '3d_pixar');
    expect(out.trim().length).toBeGreaterThan(50);
  });

  // --- F52 + F55 polish tests ---
  it('содержит английскую директиву портретного кадра (F55)', () => {
    const out = buildAvatarPrompt(baseChar, '3d_pixar');
    const hasPortrait =
      out.toLowerCase().includes('portrait') || out.toLowerCase().includes('head and shoulders');
    expect(hasPortrait).toBe(true);
  });
  it('содержит Avoid: блок с обязательными запретами (F52)', () => {
    const out = buildAvatarPrompt(baseChar, '3d_pixar');
    expect(out).toContain('Avoid:');
    expect(out).toContain('text in image');
    expect(out).toContain('captions');
    expect(out).toContain('watermarks');
    expect(out).toContain('full body composition');
  });
  it('не содержит «БЕЗ » (русских негативов) (F52)', () => {
    for (const style of ['3d_pixar', '2d_drawn', 'clay_art'] as Style[]) {
      const out = buildAvatarPrompt(baseChar, style);
      expect(out).not.toMatch(/БЕЗ /);
    }
  });
  it('style preamble 3d_pixar содержит ссылку на Pixar-фильм (F51)', () => {
    const out = buildAvatarPrompt(baseChar, '3d_pixar');
    const hasPixarFilm = out.includes('Coco') || out.includes('Soul') || out.includes('Encanto');
    expect(hasPixarFilm).toBe(true);
  });
  it('style preamble 2d_drawn содержит ссылку на Ghibli-фильм (F51)', () => {
    const out = buildAvatarPrompt(baseChar, '2d_drawn');
    const hasGhibliFilm =
      out.includes('Studio Ghibli') || out.includes('Тоторо') || out.includes('Мононоке');
    expect(hasGhibliFilm).toBe(true);
  });
  it('style preamble clay_art содержит ссылку на Aardman-фильм (F51)', () => {
    const out = buildAvatarPrompt(baseChar, 'clay_art');
    const hasAardman = out.includes('Уоллес') || out.includes('Громит') || out.includes('Aardman');
    expect(hasAardman).toBe(true);
  });
});

describe('buildDossierPrompt', () => {
  it('включает фиксированные правила model-sheet pattern', () => {
    const out = buildDossierPrompt(baseChar, '3d_pixar');
    expect(out).toContain('ЧИСТО БЕЛОМ фоне');
    expect(out).toContain('Несколько выражений лица');
    expect(out).toContain('Несколько поз тела');
    expect(out).toContain('16:9');
  });
  it('инжектит description, appearance и name', () => {
    const out = buildDossierPrompt(baseChar, '3d_pixar');
    expect(out).toContain('Дэнни');
    expect(out).toContain('Оптимистичный дельфин');
    expect(out).toContain('дельфин');
    expect(out).toContain('веснушки');
  });
  it('применяет 3d_pixar style preamble', () => {
    const out = buildDossierPrompt(baseChar, '3d_pixar');
    expect(out).toMatch(/3D Pixar/i);
  });
  it('применяет 2d_drawn style preamble', () => {
    const out = buildDossierPrompt(baseChar, '2d_drawn');
    expect(out).toMatch(/2D рисованная/i);
  });
  it('применяет clay_art style preamble', () => {
    const out = buildDossierPrompt(baseChar, 'clay_art');
    expect(out).toMatch(/пластилина/i);
  });
  it('опускает personality секцию если её нет', () => {
    const out = buildDossierPrompt({ ...baseChar, personality: undefined }, '3d_pixar');
    expect(out).not.toMatch(/Характер:/);
  });

  // --- F52 + F56 polish tests ---
  it('содержит турнараунд дисциплину — все 4 ракурса (F56)', () => {
    const out = buildDossierPrompt(baseChar, '3d_pixar');
    expect(out.toLowerCase()).toContain('front view');
    expect(out.toLowerCase()).toContain('side view');
    expect(out.toLowerCase()).toContain('3/4 view');
    expect(out.toLowerCase()).toContain('back view');
  });
  it('содержит Avoid: блок с обязательными запретами (F52)', () => {
    // Dossier REQUIRES Russian cell captions, so the Avoid: list cannot ban
    // "text in image" / "captions" generically (would contradict). Instead it
    // bans English captions + mixed-language labels + unrequested extra text.
    const out = buildDossierPrompt(baseChar, '3d_pixar');
    expect(out).toContain('Avoid:');
    expect(out).toContain('single pose');
    expect(out).toContain('environment');
    expect(out).toContain('English captions');
    expect(out).toContain('mixed-language labels');
    expect(out).not.toContain('text in image');
  });
  it('не содержит «БЕЗ » (русских негативов) (F52)', () => {
    for (const style of ['3d_pixar', '2d_drawn', 'clay_art'] as Style[]) {
      const out = buildDossierPrompt(baseChar, style);
      expect(out).not.toMatch(/БЕЗ /);
    }
  });
  it('style preamble dossier 3d_pixar содержит ссылку на Pixar-фильм (F51)', () => {
    const out = buildDossierPrompt(baseChar, '3d_pixar');
    const hasPixarFilm = out.includes('Coco') || out.includes('Soul') || out.includes('Encanto');
    expect(hasPixarFilm).toBe(true);
  });
});
