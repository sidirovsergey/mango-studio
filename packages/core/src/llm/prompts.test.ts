import { describe, expect, it } from 'vitest';
import { SCRIPT_EXAMPLES } from './examples/script-author';
import {
  CHAT_SYSTEM_PROMPT,
  buildDirectorSystemPrompt,
  buildRefinePrompt,
  buildScriptPrompt,
} from './prompts';

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

describe('buildScriptPrompt tier plumbing (T5)', () => {
  const baseInput = {
    user_prompt: 'тест',
    duration_sec: 30,
    format: '9:16' as const,
    style: '3d_pixar' as const,
  };

  it('tier:economy emits economy in engine_constraints + task reinforcement', () => {
    const p = buildScriptPrompt(baseInput, { tier: 'economy' });
    expect(p).toContain('Tier: economy');
    // tier constraint variable used in <task> reinforcement
    expect(p).toContain('scene durations must be 5 or 10 s only');
    // economy task line does NOT mention flexible premium rule
    const taskStart = p.indexOf('<task>');
    const taskBlock = p.slice(taskStart);
    expect(taskBlock).toContain('5 or 10 s only');
  });

  it('tier:premium emits premium in engine_constraints + task reinforcement', () => {
    const p = buildScriptPrompt(baseInput, { tier: 'premium' });
    expect(p).toContain('Tier: premium');
    // tier constraint variable used in <task> reinforcement
    expect(p).toContain('scene durations 4–12 s (integer), flexible');
    const taskStart = p.indexOf('<task>');
    const taskBlock = p.slice(taskStart);
    expect(taskBlock).toContain('4–12 s');
  });

  it('omitting tier defaults to economy constraints', () => {
    const p = buildScriptPrompt(baseInput);
    expect(p).toContain('Tier: economy');
    expect(p).toContain('scene durations must be 5 or 10 s only');
  });
});

describe('buildScriptPrompt XML structure (T2)', () => {
  it('buildScriptPrompt produces XML structure with tier-aware engine_constraints', () => {
    const p = buildScriptPrompt(
      {
        user_prompt: 'Кот теряет звезду',
        duration_sec: 30,
        format: '9:16',
        style: '3d_pixar',
      },
      { tier: 'premium' },
    );
    expect(p).toContain('<role>');
    expect(p).toContain('<engine_constraints>');
    expect(p).toContain('Tier: premium');
    expect(p).toContain('<cadence_table>');
    expect(p).toContain('| 30s | 6 |');
    expect(p).toContain('<arc_patterns>');
    expect(p).toContain('<output_schema>');
    expect(p).toContain('"composition"');
    expect(p).toContain('"camera_movement"');
    expect(p).toContain('"arc_role"');
    expect(p).toContain('<examples>');
    expect(p).toContain('Утренний кот'); // 15s example title
    expect(p).toContain('Космокот'); // 60s example title
    expect(p).toContain('<task>');
    expect(p).toContain('Кот теряет звезду'); // user_prompt interpolated
  });

  it('buildScriptPrompt defaults tier to economy when omitted', () => {
    const p = buildScriptPrompt({
      user_prompt: 'тест',
      duration_sec: 15,
      format: '9:16',
      style: '3d_pixar',
    });
    expect(p).toContain('Tier: economy');
  });

  it('buildScriptPrompt no longer emits stale voice_id/voice_label fields for characters', () => {
    const p = buildScriptPrompt({
      user_prompt: 'тест',
      duration_sec: 15,
      format: '9:16',
      style: '3d_pixar',
    });
    // The new <output_schema> for action:'add' must NOT mention voice_id or voice_label
    // (the discriminated union doesn't accept them).
    const outputSchemaStart = p.indexOf('<output_schema>');
    const outputSchemaEnd = p.indexOf('</output_schema>');
    const outputSchemaBlock = p.slice(outputSchemaStart, outputSchemaEnd);
    expect(outputSchemaBlock).not.toMatch(/voice_id|voice_label/);
  });
});

describe('buildRefinePrompt (1.4.B.T3)', () => {
  it('produces XML structure with visual_theme + surrounding scenes + instruction', () => {
    const p = buildRefinePrompt({
      scene: { scene_id: 's2', description: 'x', description_ru: 'x', duration_sec: 5 },
      visual_theme: {
        palette: ['#000'],
        lighting: 'noir',
        lens: '50mm',
        motion: 'static',
        mood: 'tense',
      },
      prev_scene_summary: 'кот спит',
      next_scene_summary: 'кот просыпается',
      instruction: 'сделай страшнее',
    });
    expect(p).toContain('<role>');
    expect(p).toContain('<visual_theme>');
    expect(p).toContain('"palette":["#000"]');
    expect(p).toContain('<surrounding_scenes>');
    expect(p).toContain('<prev>кот спит</prev>');
    expect(p).toContain('<next>кот просыпается</next>');
    expect(p).toContain('<examples>');
    expect(p).toContain('сделай страшнее');
    expect(p).toContain('<instruction>сделай страшнее</instruction>');
    expect(p).toContain('<task>');
  });

  it('handles null visual_theme + missing surrounding scenes', () => {
    const p = buildRefinePrompt({
      scene: { scene_id: 's1', description: 'x', description_ru: 'x', duration_sec: 5 },
      instruction: 'shorten it',
    });
    expect(p).toContain('<visual_theme>null</visual_theme>');
    expect(p).toContain('<prev>(no previous scene)</prev>');
    expect(p).toContain('<next>(no next scene)</next>');
  });

  it('embeds both REFINE_EXAMPLES in the output', () => {
    const p = buildRefinePrompt({
      scene: { scene_id: 's3', description: 'x', description_ru: 'x', duration_sec: 5 },
      instruction: 'test',
    });
    // Both example XML blocks should be present
    expect(p).toContain('сделай страшнее, ночью');
    expect(p).toContain('extreme close-up');
  });

  it('REFINE_SYSTEM_PROMPT is the <role> XML line, not the old Russian sentence', () => {
    const p = buildRefinePrompt({
      scene: { scene_id: 's4', description: 'x', description_ru: 'x', duration_sec: 5 },
      instruction: 'test',
    });
    // Must contain the new XML role
    expect(p).toContain('<role>Mango — Scene Editor');
    // Must NOT contain the old 1-sentence Russian prompt text
    expect(p).not.toContain('Верни ОДНО предложение');
    expect(p).not.toContain('AI-режиссёр.');
  });
});

describe('SCRIPT_SYSTEM_PROMPT narrator persona authoring (1.4.E.T6)', () => {
  const baseInput = {
    user_prompt: 'тест',
    duration_sec: 30,
    format: '9:16' as const,
    style: '3d_pixar' as const,
  };

  it('prompt contains 7-axis labels: Physiology, Accent, Timbre, Tempo, Pitch, Baseline, Speech patterns', () => {
    const p = buildScriptPrompt(baseInput);
    expect(p).toContain('Physiology');
    expect(p).toContain('Accent');
    expect(p).toContain('Timbre');
    expect(p).toContain('Tempo');
    expect(p).toContain('Pitch');
    expect(p).toContain('Baseline');
    expect(p).toContain('Speech patterns');
  });

  it('prompt contains the canonical example persona with em-dashes', () => {
    const p = buildScriptPrompt(baseInput);
    expect(p).toContain('Soft, mid-range female voice — General American');
  });

  it('prompt uses em-dashes (—) as separators in persona example', () => {
    const p = buildScriptPrompt(baseInput);
    // The narrator_voice_authoring block should contain em-dashes
    const idx = p.indexOf('narrator_voice_authoring');
    expect(idx).toBeGreaterThan(-1);
    const block = p.slice(idx, idx + 1500);
    expect(block).toContain('—');
  });

  it('fifteen_sec example has narrator_voice.persona set (non-empty, 7-axis)', () => {
    const parsed = JSON.parse(SCRIPT_EXAMPLES.fifteen_sec);
    const persona: string = parsed.narrator_voice.persona;
    expect(typeof persona).toBe('string');
    expect(persona.length).toBeGreaterThan(0);
    // 7 axes = at least 6 em-dashes
    const emDashCount = (persona.match(/—/g) ?? []).length;
    expect(emDashCount).toBeGreaterThanOrEqual(6);
  });

  it('sixty_sec example has narrator_voice.persona set (non-empty, 7-axis)', () => {
    const parsed = JSON.parse(SCRIPT_EXAMPLES.sixty_sec);
    const persona: string = parsed.narrator_voice.persona;
    expect(typeof persona).toBe('string');
    expect(persona.length).toBeGreaterThan(0);
    // 7 axes = at least 6 em-dashes
    const emDashCount = (persona.match(/—/g) ?? []).length;
    expect(emDashCount).toBeGreaterThanOrEqual(6);
  });

  it('personas differ between fifteen_sec and sixty_sec examples', () => {
    const parsed15 = JSON.parse(SCRIPT_EXAMPLES.fifteen_sec);
    const parsed60 = JSON.parse(SCRIPT_EXAMPLES.sixty_sec);
    expect(parsed15.narrator_voice.persona).not.toBe(parsed60.narrator_voice.persona);
  });
});

describe('CHAT_SYSTEM_PROMPT (1.4.B.T4)', () => {
  it('CHAT_SYSTEM_PROMPT strips UI-coupling vocabulary', () => {
    expect(CHAT_SYSTEM_PROMPT).not.toContain('нажми');
    expect(CHAT_SYSTEM_PROMPT).not.toContain('кнопку');
    expect(CHAT_SYSTEM_PROMPT).not.toContain('интерфейс');
  });

  it('CHAT_SYSTEM_PROMPT carries the new XML role + task structure', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('<role>');
    expect(CHAT_SYSTEM_PROMPT).toContain('Mango');
    expect(CHAT_SYSTEM_PROMPT).toContain('Pre-production Concierge');
    expect(CHAT_SYSTEM_PROMPT).toContain('<task>');
    expect(CHAT_SYSTEM_PROMPT).toContain('Respond in Russian');
    expect(CHAT_SYSTEM_PROMPT).toMatch(/no markdown headers/i);
  });
});
