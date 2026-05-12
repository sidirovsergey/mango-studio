# Phase 1.4 — Prompt Audit · Director Layer Findings

_Score the script-generation and Director Agent prompts against the `ai-video-storyboard` and `prompt-engineering-baseline` skills._

The "director layer" in our system is two prompts:

- **Script Generation** (`SCRIPT_SYSTEM_PROMPT` + `buildScriptUserPrompt`, Grok 4.1 Fast) — turns user idea into 2–8 scene JSON. **This is the shot-list author.**
- **Director Agent** (`buildDirectorSystemPrompt`, Sonnet 4.6 with 21 tools) — orchestrates edits to the script during chat.

A single refine call (`REFINE_SYSTEM_PROMPT`) and a fallback chat prompt (`CHAT_SYSTEM_PROMPT`) also belong to this layer.

---

## A. `SCRIPT_SYSTEM_PROMPT` — Score against `ai-video-storyboard`

### Storyboard skill checklist (Steps 1–7)

| Step | Required by skill | Present? | Notes |
|---|---|---|---|
| 1 — Brief intake (goal platform, duration, vibe, CTA, constraints) | ✔ if explicit | **partial** | We collect duration + format + style; **no vibe / no CTA / no hard constraints**. Grok is free to invent vibe per scene. |
| 2 — Standard cadence (duration → shot count) | duration→count table | **missing** | We say "2–8 scenes" for everything from 15s to 90s. A 15s video can be 2 × 7s or 8 × 2s — same prompt allows both. |
| 3 — Visual Theme block (palette + lighting + lens + film look + motion) **locked before any shot** | hard requirement | **missing** | Only `style` enum (3d_pixar / 2d_drawn / clay_art). No hex palette, no lighting recipe, no lens character, no motion language. The downstream image/video author has nothing structured to enforce continuity from. |
| 4 — Per-shot fields (composition, camera move, lighting, subject, action, prompt, audio direction) | hard requirement | **missing** | Scene shape is `{ description: string, duration_sec, dialogue, character_ids }`. No `composition`, no `camera_movement`, no `lighting_recipe`, no `audio_direction`. The `composition_hint` field exists in `buildFirstFramePrompt` but is never populated by Grok — only by hand. |
| 5 — Narrative arc (Hook/Build/Payoff/CTA or Problem/Solution/Proof or Atmosphere/Climax) | hard requirement | **missing** | No arc enforcement. Grok defaults to chronological. |
| 6 — Post-production checklist | nice-to-have | **n/a** | Not applicable — Mango auto-stitches, not a hand-edit workflow. |
| 7 — "Why this works" rationale | nice-to-have | **n/a** | Not user-facing. |

**Storyboard-skill score: 0/5 of the load-bearing requirements (Visual Theme, per-shot fields, narrative arc, cadence, full brief intake).**

### Critical findings on `SCRIPT_SYSTEM_PROMPT`

1. **F1 — No Visual Theme lock.** The single biggest reason scenes 1, 2, 3 don't visually match each other. Fix: emit a `visual_theme: { palette: [hex×4], lighting: "<recipe>", lens: "<character>", motion: "<language>" }` block at the top of the script JSON; every per-scene image author must read it.
2. **F2 — Scene description is one freeform paragraph.** No structured cinematography to lift downstream. The downstream `buildVideoPrompt` therefore has nothing to expand into a Director Brief (per Seedance reference). Fix: enforce a structured scene shape (`composition`, `camera_movement`, `lighting`, `action`, `audio_direction`) at script-gen time.
3. **F3 — No shot cadence rule.** Fix: introduce a `target_scenes_for_duration` lookup (15s→3, 30s→6, 60s→10–12, 90s→15–18) and require Grok to honour it. Currently 90s can be 2 scenes of 45s — impossible to generate, will fall back to clamping silently.
4. **F4 — No narrative arc pattern.** Fix: pick a default arc by duration (≤15s = Hook/Build/Payoff; 30s = Hook/Setup/Twist/Payoff; 60–90s = full 3-act) and instruct Grok to label each scene with `arc_role: "hook" | "setup" | "rising" | "climax" | "payoff" | "cta"`.
5. **F5 — Output schema embedded in system prompt as a partial-fill template** rather than as a one-shot filled example. Anthropic guideline #3 (multishot/few-shot) and #8 (specify format by example) both violated. Fix: include 1 minimal filled example (15s, 3 scenes) and 1 longer one (60s, 10 scenes) inside `<examples>` XML.
6. **F6 — Boilerplate fields in output template** (`*_versions: []`, `*_active_version_id: null`, `last_frame: null`, `final_clip: null`, `master_clip_versions: []`) waste Grok tokens on every scene. These are populated by the media pipeline, not by the script author. Fix: drop them from the schema Grok produces, normalize them in `normalizeScene` post-parse.
7. **F7 — `narrator_voice` defaults to Rachel** is hardcoded as a fallback. Should respect a project-level "narrator persona" hint (e.g., children's story = lighter voice; thriller = baritone). Tied to voice-bible work (Voice layer pass).
8. **F8 — Voice-pool assignment rules are weak.** "Avoid duplicates" is the only constraint. No "antagonist contrasts protagonist on pitch", no "child characters get female mid-range light voices". Tied to voice-bible.
9. **F9 — Russian script propagates to image/video models** via `scene.description`. nano-banana and Seedance handle some Russian but English performs measurably better. Fix: produce two scene-text fields: `description_ru` (user-facing, used by UI + voice TTS) and `description_en` (model-facing, used by image + video prompts). Grok generates both.
10. **F10 — Engine-aware authoring missing.** Grok doesn't know if the project is on economy (Seedance Lite, no native audio, 5/10s fixed) or premium (Seedance 2.0, native audio, 4–12s). It writes 7s scenes that get clamped to 5s or 8s. Fix: pass `tier` and `tier_constraints.duration_options` into the brief, instruct Grok to pick durations from that list only.

### Prompt-engineering-baseline checklist for `SCRIPT_SYSTEM_PROMPT`

| Axis | Status | Notes |
|---|---|---|
| System prompt has a clear role | ✔ | "Ты — Mango, AI-режиссёр" |
| Engine target is named | ✔ partial | Implicit — Grok via OpenRouter, no JSON-schema mode declared |
| Examples present, relevant, diverse | ✘ | No `<example>` blocks |
| XML structure separates instructions / context / examples / input | ✘ | All flat Russian text |
| Long-context layout: input at top, query at bottom | ✘ | `existingCharacters` block is in the middle of `buildScriptPrompt`; system prompt + user prompt are concatenated together (line 124) — should use separate system / user roles in the API call |
| Output format specified by example | ✘ partial | Schema is described as a partial-fill template; no fully filled exemplar |
| Engine-specific grammar (this engine = Grok, treated as plain LLM) | ✔ | n/a — Grok has no special grammar |
| No adjective soup | ✔ | Tight RU |
| Eval rubric exists | ✘ | None |
| Model choice (Grok 4.1 Fast) justified | ✔ | Cheap pass for structured outline per CLAUDE.md routing table |

---

## B. `REFINE_SYSTEM_PROMPT` — Single-scene refine

```
Тебе дано описание одной сцены и инструкция от пользователя как её улучшить.
Верни ОДНО предложение — обновлённое описание сцены, в том же стиле и тоне.
```

### Findings

11. **F11 — No surrounding context.** The refine has access only to the current scene description, not to prev/next scenes, not to the Visual Theme, not to characters in the scene. Result: "сделай эту сцену страшнее" can flip a wide-establishing into a close-up, breaking the prev_last_frame continuity chain.
12. **F12 — No cinematography preservation rule.** Should say: "keep composition, camera move, lighting recipe stable unless the instruction explicitly asks to change them". Currently the model is free to invent a totally new shot.
13. **F13 — One-sentence output** is too short for a scene that has structured per-shot fields (post F2 fix). Once F2 lands, refine output should be a JSON patch over the structured scene object, not a freeform sentence.

---

## C. `CHAT_SYSTEM_PROMPT` — Fallback chat (pre-Director-Agent)

```
Если пользователь просит что-то сгенерировать (персонажа, сцену, видео) —
скажи "сейчас сделаю" и подскажи какую кнопку в интерфейсе нажать
(например, «нажми Создать сценарий на Stage 03»).
```

### Findings

14. **F14 — UI coupling in the system prompt.** Hardcoded "нажми Создать сценарий на Stage 03". If the UI label changes, this prompt drifts silently. There is no test that catches this.
15. **F15 — Direct conflict with Director Agent rule #3** ("Не комментируй UI. Не давай указания нажать кнопку"). Two prompts in the same project carry opposite rules. When a user lands on Stage 01 we use this prompt; when they reach Stage 03 we switch to the Director Agent. The switch point is invisible to the user, the inconsistent behavior is visible.
16. **Fix:** delete the UI-instruction sentence. Either route everything to the Director Agent (with `script: null` it can already handle "tell me what to do next"), or strip UI from this prompt and let it stay conversational.

---

## D. `buildDirectorSystemPrompt` — Director Agent (Sonnet 4.6, 21 tools)

This is the biggest prompt by far — 110 lines of Russian rules + tool list + project state. Sonnet handles it but the structure leaves quality on the table.

### Prompt-engineering-baseline checklist

| Axis | Status | Notes |
|---|---|---|
| System prompt has a clear role | ✔ | "Mango, AI-режиссёр коротких мультиков" |
| Engine target named | ✔ | Sonnet 4.6 (tool use, conservative) |
| Examples (few-shot) | ✘ | **None.** Past Grok hallucination bug (Phase 1.2.5: "удалил персонажа" without calling the tool) was caused exactly by this — examples of correct tool-call vs hallucination would have prevented it. Sonnet is better but not immune. |
| XML structure | ✘ | All flat sectioned by uppercase markers (`СЦЕНАРИЙ И СЦЕНЫ:`, `ПЕРСОНАЖИ:`, `ПРАВИЛА:`) — works for Sonnet but XML is more reliable. |
| Long-context layout | ◔ | Query is at the bottom (good), but the long sections (tool list + behavioral rules) come BEFORE the project state, which means the model has to re-scan the rules every time the project state changes. Better: rules at top, project state at bottom. |
| Output format specified by example | ✘ | No example of a correct tool call or correct conversational reply. |
| Engine-specific grammar | n/a | Sonnet tool-use is OpenAI-style |
| No adjective soup | ✔ | Imperative Russian, tight |
| Eval rubric | ✘ | No regression test set for "user says X → expected tool Y" |
| Model choice (Sonnet 4.6) justified | ✔ | Tool-use, instruction-following, hallucination resistance |

### Critical findings on Director Agent

17. **F17 — No few-shot for tool routing.** Sonnet handles the verbose rules better than Grok did, but every ambiguous input is one prompt-update away from a regression. Fix: add 6–10 `<example>` blocks covering the hardest cases:
    - "удали Кота" → `archive_character`, NOT `delete_character`
    - "удали Кота навсегда" → `delete_character` (pending)
    - "удали 3-ю сцену" → `delete_scene`, NOT `refine_beat`
    - "перегенерь персонажей и сцены 2, 3, 4" → ONE pending tool + text "продолжу после подтверждения"
    - "сцена 3 пустая, переделай" → `refine_beat`, NOT `refine_scene_description` (or vice versa — see F22)
    - "у меня нет идей" → conversational reply, no tool
    - "верни Космокота" when Космокот in archived → `unarchive_character`
    - "верни Космокота" when Космокот NOT in archived → conversational reply
2. **F18 — No `<thinking>` step for tool selection.** Sonnet supports extended thinking; we don't request it. For ambiguous inputs ("сделай героя круче, и сцену 3 тоже"), a thinking step would resolve "which character, which tool, single or multi-action" before emitting the call.
3. **F19 — Project state at bottom is fine, but JSON.stringify of the entire script** bloats context for 60s+ projects. A 10-scene script with all assets reaches ~3-4kB JSON. Fix: replace `JSON.stringify(ctx.script, null, 2)` with a structured summary: `scene_id | duration | first 80 chars of description | has_first_frame | has_video | has_audio | has_final_clip`. Keep raw JSON access for tools that need it; don't dump it into the prompt every turn.
4. **F20 — Cost numbers hardcoded** in tool prompts ("$0.20–0.60", "$0.08–0.39", "$0.005–0.01") violate CLAUDE.md "fal API is source of truth". Fix: compute cost in `model-registry` or query fal at request time; pass the live number into the pending action preview.
5. **F21 — Voice-change is unhandled.** No tool exists to change a character's `voice_id`. CLAUDE.md and `character-voice-design` skill both say "`voice_id` once committed is permanent" — which is correct for production scenes already generated, but the system has no graceful path for "Rachel feels wrong, let's lock Arnold instead, before we've generated any audio". Fix: add `set_character_voice(character_id, voice_id)` tool that refuses if any `voice_audio_versions` exist for any scene with this character; otherwise updates the voice and marks subsequent audio fresh.
6. **F22 — `refine_beat` and `refine_scene_description` overlap.** Both update a scene description. The prompt distinguishes them by tone ("обновить описание" vs "обновить реплику/описание") but in practice users say "поменяй 3-ю сцену" and both fit. `refine_beat` is in scripts.ts and goes through script re-generation; `refine_scene_description` is in regenSceneTextAction and is a single LLM mini-call. The behavioural rule on dialogue handling is different too. Fix: merge into a single `refine_scene` tool with a `target: "description" | "dialogue" | "duration" | "shot"` field, OR document the difference and add it to the few-shot examples (F17).
7. **F23 — Triple-source-of-truth for confirm flow.** The "regen_scene_video requires confirm" rule appears in (a) the system prompt rules section, (b) the tool description, (c) the pending action preview. Diverges over time. Fix: single source = tool description; system prompt references it.
8. **F24 — `refine_script` is destructive against Visual Theme.** Once Visual Theme is locked (post F1), `refine_script` rewriting from scratch will lose it. Fix: pin Visual Theme through the rewrite — `refine_script` preserves the existing `visual_theme` block unless the instruction explicitly asks to change look-and-feel.

### Tool-description findings (director-tools.ts)

9. **F25 — Russian descriptions** are fine for Sonnet but make the tool list ~6kB just in descriptions. After XML wrapping and few-shot, total system+tools is approaching 12kB per turn. Use prompt caching (`cache_control: ephemeral`) on the static portion.
10. **F26 — `add_character` description re-explains the server-side duplicate guard** at length (3 sentences). The server enforces it via `ImmediateFail` — Sonnet doesn't need to know the mechanism, just the consequence. Fix: terser description.
11. **F27 — `rollback_scene_version` description is dense** ("kind=first_frame|video|voice_audio|master_clip, target_version_id опционально"). One example would be clearer than a parameter dump. Fix: add an `example` field per tool (Sonnet honours these via the tool schema).
12. **F28 — `generate_master_clip` description doesn't mention master_clip versioning.** Phase 1.3.5 added master_clip versions but the tool description still reads as if there is one master_clip per project. Fix: update to reflect "creates a new master_clip version, keeps history".

---

## Sub-totals

| Surface | Findings | Severity |
|---|---|---|
| `SCRIPT_SYSTEM_PROMPT` | F1–F10 | F1–F4 critical (the visual continuity bug source) ; F5–F10 important |
| `REFINE_SYSTEM_PROMPT` | F11–F13 | important once F2 lands |
| `CHAT_SYSTEM_PROMPT` | F14–F16 | small but trivially fixable |
| `buildDirectorSystemPrompt` | F17–F24 | F17 (few-shot) and F19 (script-dump bloat) are highest leverage |
| `director-tools.ts` | F25–F28 | hygiene |

**Total: 28 findings, of which 5 are critical (F1, F2, F3, F4, F17).**

The downstream cinematography pass and voice pass will produce their own findings — those will reference back here by F-number.
