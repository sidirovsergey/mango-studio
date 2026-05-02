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

  it('содержит описания всех 6 character tools (1.2.5 + 1.2.6)', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [],
    });
    expect(out).toContain('add_character');
    expect(out).toContain('generate_character');
    expect(out).toContain('refine_character');
    expect(out).toContain('unarchive_character');
    // Phase 1.2.6
    expect(out).toContain('archive_character');
    expect(out).toContain('delete_character');
  });

  it('убран старый fallback про "пока не умею восстанавливать"', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [],
    });
    expect(out).not.toMatch(/пока не умею восстанавливать/);
  });

  it('Phase 1.2.6: regen и refine confirms делает система, не Director текстом', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [],
    });
    // Старые «текстовый confirm» подсказки должны быть удалены
    expect(out).not.toMatch(/сначала текстовый confirm/i);
    expect(out).not.toMatch(/«У X уже есть досье/);
    // Новый rule: «не спрашивай в чате, просто вызови tool»
    expect(out).toMatch(/НЕ ДЕЛАЙ|просто вызови tool/i);
  });

  it('Phase 1.2.6: НЕ упоминает hard-delete через корзину Stage 02', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [],
    });
    expect(out).not.toMatch(/корзин/i);
    expect(out).not.toMatch(/Stage 02/i);
  });

  it('Phase 1.2.6: содержит блок ПРАВИЛА с 5+ пунктами', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [],
    });
    expect(out).toContain('ПРАВИЛА:');
    expect(out).toContain('Текстовые подтверждения — НЕ ДЕЛАЙ');
    expect(out).toContain('Словарь удаления');
    expect(out).toContain('Не комментируй UI');
    expect(out).toContain('Sync сценария — НЕ ПРЕДЛАГАЙ текстом');
  });

  it('Phase 1.2.6: словарь удаления различает archive vs delete', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [],
    });
    // archive triggers
    expect(out).toMatch(/удали X.*archive_character|archive_character.*удали/i);
    // delete triggers
    expect(out).toMatch(/удали навсегда|удали окончательно|удали полностью|насовсем/i);
  });

  it('Phase 1.3: содержит 6 scene tools в системном промпте', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [],
    });
    expect(out).toContain('regen_scene_video');
    expect(out).toContain('refine_scene_description');
    expect(out).toContain('set_scene_duration');
    expect(out).toContain('set_scene_model');
    expect(out).toContain('generate_first_frame');
    expect(out).toContain('generate_master_clip');
  });

  it('Phase 1.3: содержит поведенческие правила для сцен', () => {
    const out = buildDirectorSystemPrompt({
      ...baseCtx,
      activeCharacters: [],
      archivedCharacters: [],
    });
    expect(out).toContain('Поведенческие правила для сцен');
    expect(out).toMatch(/ОБЯЗАТЕЛЬНО confirm/i);
    expect(out).toMatch(/final_clip/i);
  });
});
