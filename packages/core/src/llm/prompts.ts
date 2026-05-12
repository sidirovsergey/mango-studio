import type { VisualTheme } from '../media/cinematography-schemas';
import { VOICE_POOL } from '../media/voices';
import { formatProjectStateSummary } from './director-state-summary';
import { DIRECTOR_AGENT_EXAMPLES } from './examples/director-agent';
import { REFINE_EXAMPLES } from './examples/refine-scene';
import { SCRIPT_EXAMPLES } from './examples/script-author';
import type { ChatMessage, RefineSceneInput, ScriptGenInput } from './provider';
import type { Scene } from './schemas';
import type { Character } from './types';

const VOICE_POOL_LINES = VOICE_POOL.map(
  (v) => `  - "${v.id}" — ${v.label} (${v.gender}, ${v.tone})`,
).join('\n');

const FORMAT_LABEL: Record<ScriptGenInput['format'], string> = {
  '9:16': 'вертикальное (TikTok/Reels/Shorts)',
  '16:9': 'горизонтальное (YouTube)',
  '1:1': 'квадратное (Instagram feed)',
};

const STYLE_LABEL: Record<ScriptGenInput['style'], string> = {
  '3d_pixar': '3D Pixar — объёмный, тёплая палитра, выразительные персонажи',
  '2d_drawn': '2D рисованный — мягкие текстуры карандаша/гуаши, ламповая атмосфера',
  clay_art: 'Клей-арт — пластилиновая анимация, фактурные поверхности, лёгкая «несовершенность»',
};

export interface BuildScriptPromptContext {
  existingCharacters?: Pick<Character, 'id' | 'name' | 'description'>[];
  tier?: 'economy' | 'premium';
  /** F24 fix: pass the project's current visual_theme so refine flows preserve it. */
  existingVisualTheme?: VisualTheme | null;
}

function renderExistingVisualThemeBlock(theme: VisualTheme | null | undefined): string {
  if (!theme) return '';
  return `
<existing_visual_theme>
ТЕКУЩАЯ ВИЗУАЛЬНАЯ ТЕМА ПРОЕКТА (JSON):
${JSON.stringify(theme, null, 2)}

ПРЕДПОЧТЕНИЕ: сохрани этот visual_theme дословно в output. Возвращай те же значения palette, lighting, lens, motion, mood, film_look, avoid.

ИСКЛЮЧЕНИЕ: только если пользовательская инструкция явно требует изменить look/feel/palette/lighting/style — тогда author новый visual_theme. Слова-триггеры для изменения: "поменяй стиль", "другая палитра", "сделай темнее/светлее", "переделай look", "верни клей-вил" и подобные.
</existing_visual_theme>`;
}

/**
 * Builds the full script-author prompt as a single XML-structured string.
 * Combines system-level instructions, cadence table, arc patterns, output schema,
 * few-shot examples, and the concrete user task — all in one prompt per
 * Grok best-practice (long-context: structured XML with query last).
 */
export function buildScriptPrompt(
  input: ScriptGenInput,
  ctx: BuildScriptPromptContext = {},
): string {
  const tier = ctx.tier ?? 'economy';
  const tierConstraints =
    tier === 'economy'
      ? 'scene durations must be 5 or 10 s only'
      : 'scene durations 4–12 s (integer), flexible';

  const styleHuman = STYLE_LABEL[input.style] ?? input.style;

  const existingVisualThemeBlock = renderExistingVisualThemeBlock(ctx.existingVisualTheme);

  const themePreservationHint = ctx.existingVisualTheme
    ? ' Если <existing_visual_theme> присутствует — копируй его поля в output без изменений, если пользователь не попросил иное.'
    : '';

  const existingCharactersBlock = ctx.existingCharacters?.length
    ? `
<existing_characters>
СУЩЕСТВУЮЩИЕ ПЕРСОНАЖИ (id + имя + описание) — сохраняй их id'ы при перегенерации, не пересоздавай:
${ctx.existingCharacters.map((c) => `- ${c.id}: ${c.name} (${c.description})`).join('\n')}

В output поле "characters" — массив discriminated union действий:
- Для каждого существующего, который остаётся — { "action": "keep", "id": "<тот же uuid>" }.
- Для нового — { "action": "add", "name": ..., "description": ..., "appearance": {...}, "personality"?: ... } (id сгенерируется на сервере).
- Для удаления — { "action": "remove", "id": "<uuid существующего>" }.

Удаляй персонажей ТОЛЬКО если сюжет фундаментально не требует их. Малые правки тона / описания НЕ требуют add/remove — используй keep.
</existing_characters>`
    : `
<characters_hint>
В output поле "characters" — массив действий для первой генерации:
[{ "action": "add", "name": "Имя", "description": "описание", "appearance": {} }]
</characters_hint>`;

  return `<role>You are Mango — Screenwriter & Storyboard Author. Convert the user's idea into a structured shot list with concrete cinematography direction. Russian narrative; English mirrors for downstream models.</role>

<engine_constraints>
- Duration: ${input.duration_sec}s
- Aspect ratio: ${input.format}
- Style: ${styleHuman}
- Tier: ${tier}  (economy = no native audio, scene durations 5 or 10s only; premium = native audio, durations 4-12s flexible)
- Tier constraint: ${tierConstraints}
</engine_constraints>

<cadence_table>
| Duration | Scene count target |
|---|---|
| 15s | 3 |
| 20s | 4 |
| 30s | 6 |
| 40s | 8 |
| 60s | 10-12 |
| 90s | 14-18 |
</cadence_table>

<arc_patterns>
- ≤15s: Hook → Build → Payoff
- 20-40s: Hook → Setup → Rising → Payoff
- 60-90s: Hook → Setup → Rising → Climax → Payoff → CTA
</arc_patterns>

<output_schema>
Return ONLY valid JSON without markdown fences or explanations, strictly matching this schema:
{
  "title": "...",
  "tier": "economy" | "premium",
  "visual_theme": { "palette": [hex×3-6], "lighting": "...", "lens": "...", "motion": "...", "mood": "..." },
  "narrator_voice": { ... },    // see <voice_pool> section for narrator_voice field details
  "scenes": [{
    "scene_id": "s1",
    "description": "...",
    "description_ru": "...",
    "description_en": "...",
    "duration_sec": 5,
    "dialogue": null | { "speaker": "narrator" | character_name, "text": "..." },
    "character_ids": ["c1"],
    "composition": { "shot_size": "...", "angle": "...", "framing_notes": "..." },
    "camera_movement": { "kind": "...", "speed": "...", "lens_character": "..." },
    "lighting": { "recipe": "...", "time_of_day": "...", "key_direction": "..." },
    "audio_direction": { "ambient": "...", "music": "...", "sfx": [], "voice_notes": "..." },
    "arc_role": "hook|setup|rising|climax|payoff|cta|beat",
    "tier_at_gen": "economy|premium",
    "first_frame_source": "auto_continuity",
    "audio_mode": "auto",
    "first_frame_versions": [], "first_frame_active_version_id": null,
    "video_versions": [], "video_active_version_id": null,
    "voice_audio_versions": [], "voice_audio_active_version_id": null,
    "last_frame": null, "final_clip": null
  }, ...],
  "characters": [
    { "action": "add", "name": "...", "description": "...", "appearance": {...}, "personality": "..." },
    ...
  ],
  "master_clip_versions": [], "master_clip_active_version_id": null
}

Field rules:
- dialogue.speaker — 'narrator' for voice-over OR character name for character dialogue. dialogue: null if scene is silent.
- character_ids — empty [] if no characters in scene; otherwise list character names (for 'add' actions names are used as references until ids are assigned by server).
- description — same text as description_ru (legacy mirror field).
- description_ru — Russian, vivid, cinematic prose.
- description_en — English translation of description_ru for downstream image/video models.
- first_frame_source — always 'auto_continuity'.
- audio_mode — always 'auto' at generation time (resolver picks native vs silent_tts by dialogue language and model). Use 'native' only for confirmed English dialogue in premium tier.
- *_versions fields and *_active_version_id — ALWAYS empty arrays / null at generation time.
- last_frame, final_clip, master_clip_versions, master_clip_active_version_id — ALWAYS null / [] at generation time.
- tier_at_gen — set to the current tier: "${tier}".
- narrator_voice — see &lt;voice_pool&gt; section for narrator_voice field specification.
- characters[].action:'add' — only fields: name, description, appearance (optional), personality (optional). Do NOT add voice fields here — character voices are assigned later via the Director set_character_voice tool.
</output_schema>

<voice_pool>
narrator_voice schema: { "tts_voice_id": "<id from pool below>", "persona": "<7-axis string — see narrator_voice_authoring below>", "stability": 0-1, "similarity_boost": 0-1, "style": 0-1, "speed": 0-1 }
narrator_voice.tts_voice_id must be one of the ElevenLabs ids listed below (pick the one that best fits the mood and genre):
${VOICE_POOL_LINES}
Note: characters[].action:'add' does NOT carry a voice field — character voices are assigned later via the Director tool.
</voice_pool>

<narrator_voice_authoring>
The narrator_voice block must include a \`persona\` field — a single sentence describing the voice along 7 axes, separated by em-dashes (—):
1. Physiology (gender + body resonance, e.g. "Soft, mid-range female voice")
2. Accent (regional/national, e.g. "General American", "Mid-Atlantic", "Russian")
3. Timbre (vocal texture, e.g. "slightly breathy timbre", "warm raspy quality")
4. Tempo (pace + pause pattern, e.g. "medium tempo with thoughtful pauses")
5. Pitch (pitch range + tonal centre, e.g. "mid-tenor pitch with warm range")
6. Baseline (default emotional tone, e.g. "calm and curious baseline")
7. Speech patterns (characteristic mannerisms, e.g. "drags out vowels on key words")

Example: "Soft, mid-range female voice — General American — slightly breathy timbre — medium tempo with thoughtful pauses — mid-tenor pitch with warm range — calm and curious baseline — drags out vowels on key words"

The persona drives both human voice-casting and TTS settings tuning. Be specific and concrete.
</narrator_voice_authoring>

<examples>
  <example duration="15" arc="hook-build-payoff">
    <input>Idea: «утренний ритуал кота»</input>
    <output>
${SCRIPT_EXAMPLES.fifteen_sec}
    </output>
  </example>
  <example duration="60" arc="full">
    <input>Idea: «кот-астронавт ищет потерянную звезду»</input>
    <output>
${SCRIPT_EXAMPLES.sixty_sec}
    </output>
  </example>
</examples>
${existingCharactersBlock}
${existingVisualThemeBlock}
<task>
User idea: «${input.user_prompt}»
Author a structured shot list per the schema and examples above. Russian for \`description_ru\` and \`dialogue.text\`; English for \`description_en\`. Lock \`visual_theme\` once and reference it from each scene's \`lighting\` and \`camera_movement\` for continuity.${themePreservationHint} Use cinematic verbs (Dolly In, Crane Up, Orbit, Tracking) — not "cinematic motion". Scene count must match the cadence_table for ${input.duration_sec}s. Each scene duration_sec must satisfy tier "${tier}" constraint: ${tierConstraints}.
</task>`;
}

export function buildScriptUserPrompt(input: ScriptGenInput): string {
  return `Идея пользователя: «${input.user_prompt}»

Параметры:
- Длительность: ${input.duration_sec} секунд
- Формат кадра: ${FORMAT_LABEL[input.format]}
- Визуальный стиль: ${STYLE_LABEL[input.style]}

Сгенерируй сценарий по этой идее, соблюдая параметры. Верни JSON по схеме.`;
}

/**
 * REFINE_SYSTEM_PROMPT — system role for the structured scene-patch path.
 * The full prompt is assembled via buildRefinePrompt(ctx).
 *
 * Legacy 1-sentence path: buildRefineUserPrompt (kept for back-compat until 1.4.B.T5 swaps callers).
 */
export const REFINE_SYSTEM_PROMPT = `<role>Mango — Scene Editor. Revise one scene's structured fields per the user's instruction, preserving all unspecified fields. Honour visual_theme — only change look/feel fields if explicitly asked.</role>`;

export interface RefineSceneContext {
  /** The full structured scene object (will be JSON-serialised). */
  scene: unknown;
  /** Visual theme from the script; pass null if not available. */
  visual_theme?: unknown | null;
  /** Short summary of the preceding scene, e.g. "Кот просыпается". */
  prev_scene_summary?: string;
  /** Short summary of the following scene. */
  next_scene_summary?: string;
  /** The user's refinement instruction. */
  instruction: string;
}

/**
 * Builds the full structured refine prompt for a single scene.
 * Returns the complete XML-wrapped prompt ready to send as the user message
 * when using REFINE_SYSTEM_PROMPT as the system prompt.
 *
 * Added in Phase 1.4.B.T3. Callers will be switched in 1.4.B.T5.
 */
export function buildRefinePrompt(ctx: RefineSceneContext): string {
  const themeJson = ctx.visual_theme ? JSON.stringify(ctx.visual_theme) : 'null';
  const sceneJson = JSON.stringify(ctx.scene);
  const prev = ctx.prev_scene_summary ?? '(no previous scene)';
  const next = ctx.next_scene_summary ?? '(no next scene)';
  return `${REFINE_SYSTEM_PROMPT}

<visual_theme>${themeJson}</visual_theme>

<surrounding_scenes>
  <prev>${prev}</prev>
  <current>${sceneJson}</current>
  <next>${next}</next>
</surrounding_scenes>

<examples>
${REFINE_EXAMPLES.tone_change}
${REFINE_EXAMPLES.composition_change}
</examples>

<instruction>${ctx.instruction}</instruction>

<task>
Return the FULL updated scene object (same schema). Change only what the instruction asks. Echo every other field verbatim from <current>. Output JSON only, no markdown.
</task>`;
}

/** @deprecated Legacy 1-sentence refine path — kept until 1.4.B.T5 swaps callers. */
export function buildRefineUserPrompt(input: RefineSceneInput): string {
  return `Текущее описание сцены: «${input.current}»

Инструкция: ${input.instruction}

Дай обновлённое описание сцены.`;
}

export const CHAT_SYSTEM_PROMPT = `<role>Mango — Pre-production Concierge. You guide the user before the Director Agent takes over at Stage 03. Conversational, warm, terse.</role>

<task>
Respond in Russian, no markdown headers. If the user asks how to create or generate something, describe what Mango will do next and what input you need from them — never reference UI elements (buttons, stages, labels) since those drift independently.
</task>`;

export function chatMessagesWithSystem(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length > 0 && messages[0]!.role === 'system') return messages;
  return [{ role: 'system', content: CHAT_SYSTEM_PROMPT }, ...messages];
}

// ─── Director System Prompt (Phase 1.4.F.T3) ─────────────────────────────────

/**
 * New DirectorContext aligned with T2's formatProjectStateSummary input.
 * `activeCharacters` / `archivedCharacters` are derived from `script.characters`
 * by the archived flag inside the function.
 *
 * If script is null the prompt still works — formatProjectStateSummary receives
 * empty characters/scenes arrays.
 */
export interface DirectorContext {
  idea: string;
  duration_sec: number;
  format: string;
  style: string;
  script: {
    title?: string;
    tier?: 'economy' | 'premium';
    target_duration_sec?: number;
    scenes: Array<Scene>;
    characters: Array<Character>;
  } | null;
}

// ─── Static prefix (built once at module load, re-used every call) ────────────

function buildStaticPrefix(): string {
  const examplesXml = DIRECTOR_AGENT_EXAMPLES.map((ex) => {
    const toolCallsText =
      ex.tool_calls.length === 0
        ? '(none)'
        : ex.tool_calls.map((tc) => `${tc.name}(${JSON.stringify(tc.args)})`).join(', ');
    // Trim thinking to first sentence to keep static prefix under 8KB (F80).
    const thinkingShort = `${ex.thinking.split('. ')[0]}.`;
    return `<example label="${ex.label}">
User: ${ex.user_message}
Thinking: ${thinkingShort}
Tool calls: ${toolCallsText}
Reply: ${ex.reply}
</example>`;
  }).join('\n\n');

  return `<role>
Mango — AI-режиссёр коротких мультиков. Decides which tool to call given the user's request and the project state below. Conversational, terse, truthful: NEVER claim "удалил/нарисовал/обновил" without calling the corresponding tool in this turn.
</role>

<engine_constraints>
- Длительность сцены: 1-30 сек. Видеомодели clamp'ят к своим duration_options.
- Видео-генерация: ~$0.05-0.60 за сцену по tier (economy/premium).
- Reference image: single-pose 1:1, anchored to character.dossier.reference_image.
- Russian dialogue → silent_tts + ElevenLabs post-mix. Native audio is English-only.
- Стили: 3d_pixar, 2d_drawn, clay_art.
- Форматы: 9:16, 16:9, 1:1. Длительности: 15/20/30/40/60/90.
</engine_constraints>

<behavioral_rules>
1. Truth rule: текст не выполняет действия — выполняют только tools. Не пиши «готово»/«сделал»/«удалил» если не вызвал tool.
2. One pending per turn: за один turn не отдавай больше одной destructive операции. Multi-scene regen → один refine_script, не три regen_scene_video.
3. Archive ≠ delete: «удали X» → archive_character (recoverable). «удали X навсегда», «удали окончательно», «удали полностью», «насовсем» → delete_character (pending confirm).
4. Tool description vs prompt: подробные параметры — в inputSchema каждого tool. Здесь — только список и signal.
5. Cost-aware: видео-tools показывают cost_hint в своей карточке. Не дублируй цены в чате.
6. After tool execution: система показывает tool-chip. Не повторяй результат текстом.
7. Unknown character: если имя не в <characters_active> и не в <characters_archived> — текст «не нашёл», не вызывай tool.
8. Voice locked: set_character_voice вернёт error 'voice_locked' если есть rendered audio. Surface error verbatim.
9. Conversational reply: «у меня нет идей» / «как лучше?» → tool=∅, текст с открытыми вариантами.
10. Multi-step intent: если запрос требует 2+ tools, спроси приоритет; не chain'и автоматом.
</behavioral_rules>

<tools_reference>
SCRIPT: refine_script, regen_script, refine_beat, add_scene, delete_scene, update_project_meta
SCENE MEDIA: regen_scene_video, refine_scene_description, set_scene_duration, set_scene_model, generate_first_frame, generate_master_clip, rollback_scene_version
CHARACTER: add_character, generate_character, refine_character, archive_character, unarchive_character, delete_character, set_character_voice
Все signatures — в tool inputSchemas. Не угадывай аргументы.
</tools_reference>

<examples>
${examplesXml}
</examples>`;
}

const DIRECTOR_STATIC_PREFIX = buildStaticPrefix();

// ─── Public function ──────────────────────────────────────────────────────────

export function buildDirectorSystemPrompt(ctx: DirectorContext): string {
  // Build the dynamic project state using T2's helper.
  // When script is null, pass empty arrays so the helper still emits valid XML.
  const stateInput = ctx.script
    ? { script: ctx.script }
    : { script: { scenes: [] as Array<Scene>, characters: [] as Array<Character> } };

  const stateSummary = formatProjectStateSummary(stateInput);

  const projectLine = `Project: idea="${ctx.idea}" duration=${ctx.duration_sec}s format=${ctx.format} style=${ctx.style}.`;

  return `${DIRECTOR_STATIC_PREFIX}

<!-- CACHE BOUNDARY -->

<project_state>
${stateSummary}

${projectLine}
</project_state>

<task>
1. Read the user's most recent message + project_state above.
2. Reason briefly about routing in your thinking (which tool, why).
3. Call at most ONE tool per turn (rule 2).
4. Write a brief Russian reply that reflects what the tool will do (or, if no tool, addresses the user conversationally).
5. Never fabricate completion.
</task>`;
}
