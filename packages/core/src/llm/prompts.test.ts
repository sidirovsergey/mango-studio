import { describe, expect, it } from 'vitest';
import { buildDirectorSystemPrompt, buildScriptPrompt } from './prompts';

describe('buildScriptPrompt с existingCharacters', () => {
  const baseInput = {
    user_prompt: 'idea',
    duration_sec: 30,
    format: '9:16' as const,
    style: '3d_pixar' as const,
  };

  it('без ctx — first-generation hint', () => {
    const out = buildScriptPrompt(baseInput);
    expect(out).toMatch(/первая генерация|action.*add/i);
    expect(out).not.toMatch(/СУЩЕСТВУЮЩИЕ ПЕРСОНАЖИ/);
  });

  it('с ctx — инжектит existing block + keep/add/remove rules', () => {
    const out = buildScriptPrompt(baseInput, {
      existingCharacters: [
        { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Дэнни', description: 'дельфин' },
      ],
    });
    expect(out).toContain('СУЩЕСТВУЮЩИЕ ПЕРСОНАЖИ');
    expect(out).toContain('550e8400-e29b-41d4-a716-446655440000');
    expect(out).toMatch(/keep/);
    expect(out).toMatch(/add/);
    expect(out).toMatch(/remove/);
  });
});

describe('buildDirectorSystemPrompt — characters context', () => {
  const baseCtx = {
    idea: 'про дельфина',
    duration_sec: 30,
    format: '9:16',
    style: '3d_pixar',
    script: null,
  };

  it('без active/archived — рендерит пустые блоки и НЕ показывает archived секцию', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [],
    });
    expect(out).toContain('АКТИВНЫЕ ПЕРСОНАЖИ');
    expect(out).toMatch(/нет персонажей|пусто|—/i);
    expect(out).not.toContain('УДАЛЁННЫЕ ПЕРСОНАЖИ');
  });

  it('active с has_dossier=true — отображает имя/id/has_dossier', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [
        {
          id: 'a3f2aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          name: 'Алиса',
          description: 'мечтательная',
          has_dossier: true,
        },
      ],
      archivedCharacters: [],
    });
    expect(out).toContain('Алиса');
    expect(out).toContain('a3f2aaaa');
    expect(out).toMatch(/has_dossier.*true/);
  });

  it('archived список — отображает блок УДАЛЁННЫЕ', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [
        {
          id: '7b4abbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          name: 'Дэнни',
          description: 'кот',
        },
      ],
    });
    expect(out).toContain('УДАЛЁННЫЕ ПЕРСОНАЖИ');
    expect(out).toContain('Дэнни');
    expect(out).toContain('unarchive_character');
  });

  it('содержит описания 4 новых tools', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [],
    });
    expect(out).toContain('add_character');
    expect(out).toContain('generate_character');
    expect(out).toContain('refine_character');
    expect(out).toContain('unarchive_character');
  });

  it('убран старый fallback про "пока не умею восстанавливать"', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [],
    });
    expect(out).not.toMatch(/пока не умею восстанавливать/);
  });

  it('содержит правило про confirmation перед regen generate_character', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [],
    });
    expect(out).toMatch(/has_dossier.*подтверд|подтвержд.*has_dossier/i);
  });

  it('содержит правило про hard-delete через корзину Stage 02', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [],
    });
    expect(out).toMatch(/корзин|Stage 02/i);
  });
});
