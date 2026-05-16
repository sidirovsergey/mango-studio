import { describe, expect, it } from 'vitest';
import { DIRECTOR_AGENT_EXAMPLES } from './examples/director-agent';
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

// ─── Shared minimal fixtures for DirectorContext ─────────────────────────────

const BASE_CTX_EMPTY = {
  idea: 'про дельфина',
  duration_sec: 30,
  format: '9:16',
  style: '3d_pixar',
  script: null,
};

const POPULATED_CTX = {
  idea: 'кот-астронавт',
  duration_sec: 30,
  format: '9:16',
  style: '3d_pixar',
  script: {
    title: 'Космокот',
    tier: 'premium' as const,
    target_duration_sec: 30,
    characters: [
      {
        id: 'a3f2aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name: 'Алиса',
        description: 'мечтательная девочка с рыжими волосами',
        full_prompt: '',
        appearance: {},
        voice: {},
        dossier: {
          storage: { kind: 'fal_passthrough' as const, url: 'https://x.com/a.jpg' },
          model: 'nm',
          format: '16:9' as const,
          quality: '720p' as const,
          generated_at: '2024-01-01T00:00:00Z',
        },
        reference_images: [],
        archived: false,
      },
      {
        id: '7b4abbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        name: 'Дэнни',
        description: 'кот-астронавт',
        full_prompt: '',
        appearance: {},
        voice: {},
        dossier: null,
        reference_images: [],
        archived: true,
      },
    ],
    scenes: [
      {
        scene_id: 's1',
        description: 'первые секунды на кухне',
        description_ru: 'первые секунды на кухне',
        description_en: 'first seconds in the kitchen',
        duration_sec: 5,
        arc_role: 'hook' as const,
        tier_at_gen: 'premium' as const,
        first_frame_source: 'auto_continuity' as const,
        audio_mode: 'auto' as const,
        first_frame_versions: [],
        first_frame_active_version_id: null,
        video_versions: [],
        video_active_version_id: null,
        voice_audio_versions: [],
        voice_audio_active_version_id: null,
        last_frame: null,
        final_clip: null,
        character_ids: [],
        dialogue: null,
        composition: null,
        camera_movement: null,
        lighting: null,
        audio_direction: null,
      },
    ],
  },
};

describe('buildDirectorSystemPrompt — characters context (legacy compat)', () => {
  it('без script — рендерит пустые character blocks', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    // New prompt uses <characters_active> block from formatProjectStateSummary
    expect(out).toContain('<characters_active>');
    expect(out).not.toMatch(/пока не умею восстанавливать/);
  });

  it('active с has_dossier=true — отображает имя/id/has_dossier', () => {
    const out = buildDirectorSystemPrompt(POPULATED_CTX);
    expect(out).toContain('Алиса');
    expect(out).toContain('a3f2aaaa');
    expect(out).toMatch(/dossier=true/);
  });

  it('archived список — отображает characters_archived блок', () => {
    const out = buildDirectorSystemPrompt(POPULATED_CTX);
    expect(out).toContain('<characters_archived>');
    expect(out).toContain('Дэнни');
    expect(out).toContain('unarchive_character');
  });

  it('содержит все character tools', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    expect(out).toContain('add_character');
    expect(out).toContain('generate_character');
    expect(out).toContain('refine_character');
    expect(out).toContain('unarchive_character');
    expect(out).toContain('archive_character');
    expect(out).toContain('delete_character');
  });

  it('Phase 1.3: содержит scene tools в системном промпте', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    expect(out).toContain('regen_scene_video');
    expect(out).toContain('refine_scene_description');
    expect(out).toContain('set_scene_duration');
    expect(out).toContain('set_scene_model');
    expect(out).toContain('generate_first_frame');
    expect(out).toContain('generate_master_clip');
  });

  it('Phase 1.2.6: словарь удаления различает archive vs delete', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    expect(out).toMatch(/удали навсегда|удали окончательно|удали полностью|насовсем/i);
  });

  it('Phase 1.2.6: НЕ упоминает hard-delete через корзину Stage 02', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    expect(out).not.toMatch(/корзин/i);
    expect(out).not.toMatch(/Stage 02/i);
  });
});

describe('buildDirectorSystemPrompt — T3 XML structure (1.4.F.T3)', () => {
  it('1. starts with <role> tag', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    expect(out.trimStart()).toMatch(/^<role>/);
  });

  it('2. has all 5 static blocks + 2 dynamic blocks', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    expect(out).toContain('<engine_constraints>');
    expect(out).toContain('<behavioral_rules>');
    expect(out).toContain('<tools_reference>');
    expect(out).toContain('<examples>');
    expect(out).toContain('<project_state>');
    expect(out).toContain('<task>');
  });

  it('3. CACHE BOUNDARY literal present', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    expect(out).toContain('<!-- CACHE BOUNDARY -->');
  });

  it('4. 8 fewshot example blocks present', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    // Count <example occurrences (opening tags)
    const count = (out.match(/<example /g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(8);
  });

  it('5. all 8 labels from DIRECTOR_AGENT_EXAMPLES appear', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    for (const ex of DIRECTOR_AGENT_EXAMPLES) {
      expect(out).toContain(ex.label);
    }
  });

  it('6. <project_state> block contains characters_active and scenes_summary', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    expect(out).toContain('<characters_active>');
    expect(out).toContain('<scenes_summary>');
  });

  it('7. static prefix (before CACHE BOUNDARY) is under 8KB', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    const boundary = out.indexOf('<!-- CACHE BOUNDARY -->');
    expect(boundary).toBeGreaterThan(0);
    const prefix = out.slice(0, boundary);
    const bytes = Buffer.byteLength(prefix, 'utf8');
    expect(bytes).toBeLessThan(8192);
  });

  it('8. behavioral_rules has at most 10 rules', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    const rulesStart = out.indexOf('<behavioral_rules>');
    const rulesEnd = out.indexOf('</behavioral_rules>');
    expect(rulesStart).toBeGreaterThan(-1);
    const rulesBlock = out.slice(rulesStart, rulesEnd);
    // Count numbered rules: lines starting with a digit followed by a period
    const ruleLines = rulesBlock.match(/^\d+\./gm) ?? [];
    expect(ruleLines.length).toBeLessThanOrEqual(10);
  });

  it('9. tools_reference block is under 600 chars', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    const start = out.indexOf('<tools_reference>');
    const end = out.indexOf('</tools_reference>');
    expect(start).toBeGreaterThan(-1);
    const block = out.slice(start, end + '</tools_reference>'.length);
    expect(block.length).toBeLessThan(600);
  });

  it('10. behavioral_rules contains truth rule (не пиши)', () => {
    const out = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    expect(out).toMatch(/не пиши|truth rule|Truth rule/i);
  });

  it('11. reproducible: same ctx → identical output', () => {
    const a = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    const b = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    expect(a).toBe(b);
  });

  it('12. static prefix (role block) is identical regardless of dynamic state', () => {
    const out1 = buildDirectorSystemPrompt(BASE_CTX_EMPTY);
    const out2 = buildDirectorSystemPrompt(POPULATED_CTX);
    const boundary1 = out1.indexOf('<!-- CACHE BOUNDARY -->');
    const boundary2 = out2.indexOf('<!-- CACHE BOUNDARY -->');
    const prefix1 = out1.slice(0, boundary1);
    const prefix2 = out2.slice(0, boundary2);
    // role block should be byte-identical
    const roleEnd1 = out1.indexOf('</role>') + '</role>'.length;
    const roleEnd2 = out2.indexOf('</role>') + '</role>'.length;
    expect(out1.slice(0, roleEnd1)).toBe(out2.slice(0, roleEnd2));
    // prefixes are the same length (same static content)
    expect(prefix1).toBe(prefix2);
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
    expect(p).toContain('scene durations 4–12 s (integer)');
    expect(p).toContain('STRONGLY prefer 10s');
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
    expect(p).toMatch(/\|\s*30s\s*\|\s*3\b/); // new cadence: 30s → 3 scenes × 10s
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

describe('SCRIPT_SYSTEM_PROMPT narrator persona authoring (retired 2026-05-13)', () => {
  // The narrator_voice + 7-axis persona authoring block was removed when the
  // ElevenLabs TTS pipeline got ripped out. Native-audio video models render
  // narration from the dialogue text directly. The remaining test asserts the
  // negative: the old voice_pool / narrator_voice_authoring sections are
  // GONE from the prompt.
  const baseInput = {
    user_prompt: 'тест',
    duration_sec: 30,
    format: '9:16' as const,
    style: '3d_pixar' as const,
  };

  it('prompt no longer carries a narrator_voice / voice_pool authoring block', () => {
    const p = buildScriptPrompt(baseInput);
    expect(p).not.toMatch(/<voice_pool>/);
    expect(p).not.toMatch(/<narrator_voice_authoring>/);
  });

  it('prompt explicitly tells the LLM not to emit narrator_voice', () => {
    const p = buildScriptPrompt(baseInput);
    expect(p).toContain('DO NOT emit a top-level "narrator_voice" object');
  });
});

describe('buildScriptPrompt existingVisualTheme (T6 — F24)', () => {
  const baseInput = {
    user_prompt: 'тест',
    duration_sec: 30,
    format: '9:16' as const,
    style: '3d_pixar' as const,
  };

  const sampleTheme = {
    palette: ['#1a1a2e', '#16213e', '#0f3460', '#e94560'],
    lighting: 'noir backlighting with rim highlights',
    lens: '35mm anamorphic',
    motion: 'slow push-in',
    mood: 'тревожный, ночной',
    film_look: 'high contrast',
    avoid: ['overexposure', 'warm tones'],
  };

  it('1. с existingVisualTheme — инжектит <existing_visual_theme> блок с полями темы', () => {
    const p = buildScriptPrompt(baseInput, { existingVisualTheme: sampleTheme });
    expect(p).toContain('<existing_visual_theme>');
    expect(p).toContain('ТЕКУЩАЯ ВИЗУАЛЬНАЯ ТЕМА ПРОЕКТА');
    expect(p).toContain('#1a1a2e');
    expect(p).toContain('noir backlighting');
    expect(p).toContain('35mm anamorphic');
  });

  it('2. без ctx — НЕ содержит <existing_visual_theme>', () => {
    const p = buildScriptPrompt(baseInput);
    expect(p).not.toContain('<existing_visual_theme>');
  });

  it('3. existingVisualTheme: null — НЕ содержит <existing_visual_theme>', () => {
    const p = buildScriptPrompt(baseInput, { existingVisualTheme: null });
    expect(p).not.toContain('<existing_visual_theme>');
  });

  it('4. с existingVisualTheme — closing instruction содержит директиву preservation', () => {
    const p = buildScriptPrompt(baseInput, { existingVisualTheme: sampleTheme });
    // Check closing <task> contains the preservation hint
    const taskStart = p.indexOf('<task>');
    expect(taskStart).toBeGreaterThan(-1);
    const taskBlock = p.slice(taskStart);
    expect(taskBlock).toMatch(/existing_visual_theme.*копируй|копируй.*existing_visual_theme/i);
  });

  it('5. existingVisualTheme содержит palette, lighting, lens в JSON блоке', () => {
    const p = buildScriptPrompt(baseInput, { existingVisualTheme: sampleTheme });
    const blockStart = p.indexOf('<existing_visual_theme>');
    const blockEnd = p.indexOf('</existing_visual_theme>');
    const block = p.slice(blockStart, blockEnd + '</existing_visual_theme>'.length);
    expect(block).toContain('"palette"');
    expect(block).toContain('"lighting"');
    expect(block).toContain('"lens"');
    expect(block).toContain('"motion"');
    expect(block).toContain('"mood"');
    expect(block).toContain('ПРЕДПОЧТЕНИЕ');
    expect(block).toContain('ИСКЛЮЧЕНИЕ');
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
