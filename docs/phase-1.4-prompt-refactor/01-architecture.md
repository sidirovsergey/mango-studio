# Phase 1.4 — Prompt Refactor Architecture

## Goal

Replace legacy monolithic prompts and inline-string media calls with structured, engine-aware, evaluable prompt surfaces. Phase 1.4 closes 13 critical + 64 supporting audit findings catalogued in `docs/phase-1.4-prompt-audit/` (see `00-summary.md` for the full index).

This document is a navigable reference for maintainers. It summarises what changed and why; it does not duplicate the spec (`docs/superpowers/specs/2026-05-12-phase-1.4-prompt-refactor-design.md`) or audit reports.

---

## What changed (high level)

### 1. New schema fields (Phase 1.4.A)

`Scene` gains six new prompt-driving fields:

- `description_en` — English prose anchor consumed by all prompt builders.
- `composition` / `camera_movement` / `lighting` — cinematography axes (enum-constrained in `cinematography-schemas.ts`).
- `audio_direction` — explicit audio instruction, supercedes inline prose.
- `arc_role` — narrative position (`opening` / `rising` / `climax` / `resolution`).
- `tier_at_gen` — tier snapshot at generation time (avoids stale-tier prompt drift).

`Script` gains `visual_theme` (string, free-form aesthetic) and `tier` (mirrors project tier at script generation).

`Character.voice` block is extended with flat ElevenLabs settings (`stability`, `similarity_boost`, `style`, `speed`) plus a `persona` field (7-axis narrative persona).

`NarratorVoice` gains `persona` (same 7-axis shape).

`Character.dossier` gains `reference_image` — a single-pose 1:1 character design anchor (distinct from `dossier.storage`, which is the multi-panel sheet).

**Schemas:** `packages/core/src/llm/schemas.ts`, `packages/core/src/media/cinematography-schemas.ts`

---

### 2. Per-engine video prompt dispatcher (Phase 1.4.C)

A single `buildVideoPrompt(input: VideoPromptInput): VideoPromptOutput` function dispatches by `input.model` to one of six engine-specific builders:

| Model | Builder | Format |
|---|---|---|
| Seedance 2.0 / Pro | `seedance-2.ts` | `[SCENE]/[SUBJECT]/[ACTION]/[CAMERA]/[AUDIO]/[Pacing]/Avoid:` with time-segmented action |
| Seedance Lite | `seedance-lite.ts` | Same shape minus `[AUDIO]` |
| Veo 3.1 | `veo-3.1.ts` | Block grammar `[Cinematography]/[Subject]/[Action]/[Context]/[Style]` |
| Kling 2.5 | `kling-2.5.ts` | Beat-marked `[MM:SS–MM:SS]` timeline with audio direction |
| LTX | `ltx.ts` | Minimal 3-section labeled (`Description:/Camera:/Audio:`) |
| Generic fallback | `generic.ts` | Plain prose paragraphs |

Common cinematography label tables (camera moves, lighting terms) live in `_seedance-shared.ts` and are imported by all builders that need them. (Note: despite the name, this file is now shared across more than Seedance; rename to `_cinematography-shared.ts` at next opportunity.)

**Pointers:** `packages/core/src/media/video-prompts/{index,types,seedance-2,seedance-lite,veo-3.1,kling-2.5,ltx,generic,_seedance-shared}.ts`

---

### 3. Reference image + first-frame chain (Phase 1.4.D)

**F53 fix** — first-frame prompts previously used `character.dossier.storage` (a multi-panel reference sheet with an explicit "DO NOT replicate the layout" anti-pattern). Phase 1.4.D replaces this with a dedicated single-pose 1:1 anchor.

Flow:

1. `buildReferenceImagePrompt` produces a single-pose 1:1 character design prompt.
2. `generateReferenceImageAction` submits to fal; webhook writes the result URL to `character.dossier.reference_image`.
3. After dossier generation completes, `pollMediaJobsAction` fire-and-forgets `generateReferenceImageAction` to ensure the reference image is chained automatically.
4. `buildFirstFramePrompt` (in `image-prompts/first-frame.ts`) consumes `character.dossier.reference_image` as the primary character anchor.

**Pointers:**
- `packages/core/src/media/image-prompts/reference-image.ts`
- `packages/core/src/media/image-prompts/first-frame.ts`
- `apps/web/src/server/actions/generateReferenceImageAction.ts`
- `apps/web/src/server/actions/pollMediaJobsAction.ts`
- `apps/web/src/server/actions/generateFirstFrameAction.ts`

---

### 4. Voice layer (Phase 1.4.E)

**F29 pool reconcile:** 4 of 6 voice IDs were 404 in live ElevenLabs. Remapped: Rachel→Janet, Domi→Jessica, Antoni→George, Arnold→Daniel; Bella relabelled to Sarah; Adam kept. See `voices.md` for the full pool with 7-axis persona stubs and `voice_settings_default` per slot.

**New mechanisms:**
- `voice_settings_default` per pool slot — ElevenLabs generation parameters that apply when no character-level override exists.
- `resolveVoiceSettings(speaker, characters, narrator)` — precedence: character.voice settings → narrator settings → pool default → hardcoded constant.
- `set_character_voice` Director tool — includes a `voice_locked` guard: refuses if any scene in the project already has rendered voice audio for this character.
- **F37 voice canary** in `character-diff-merge.ts` — `keep` actions preserve `character.voice` unconditionally, preventing accidental voice-ID erasure during script re-merges.

**Pointers:**
- `packages/core/src/media/voices.ts`
- `packages/core/src/media/audio-mode.ts`
- `apps/web/src/server/actions/setCharacterVoiceAction.ts`
- `apps/web/src/server/actions/generateSceneVoiceAction.ts`
- `voices.md` (root of worktree)

---

### 5. Director Agent overhaul (Phase 1.4.F)

**Prompt structure — static prefix + cache boundary:**

```
<role> ... </role>
<engine_constraints> ... </engine_constraints>
<behavioral_rules> ... </behavioral_rules>
<tools_reference> ... </tools_reference>
<examples> ... </examples>
<!-- CACHE BOUNDARY -->
<project_state> ... </project_state>
<task> ... </task>
```

The static prefix (role + rules + examples) is < 8 KB and stays constant across turns in a session — Anthropic auto-caches it. The dynamic suffix (project state + task) changes each turn. Cache control is applied at message-level via `providerOptions.anthropic.cacheControl: { type: 'ephemeral' }` on the system message (request-level was found to be non-functional via the OpenRouter SDK).

**8 few-shot tool-routing examples** in `packages/core/src/llm/examples/director-agent.ts` — cover: archive vs hard-delete ambiguity, voice-lock refusal, conversational fallback (no-tool), scene regen, set_character_voice, rollback, cost query.

**Extended thinking:** `providerOptions.openrouter.thinking: { type: 'enabled', budget_tokens: 2000 }` (snake_case via OpenRouter pass-through). Override with `MANGO_DISABLE_THINKING=1` for latency A/B.

**`formatProjectStateSummary`** produces a compact per-turn state dump (characters, scenes, active versions, pending jobs) consumed by the dynamic suffix.

**Pointers:**
- `packages/core/src/llm/prompts.ts` — `buildDirectorSystemPrompt`
- `packages/core/src/llm/examples/director-agent.ts`
- `packages/core/src/llm/director-state-summary.ts`
- `packages/core/src/llm/openrouter-provider.ts`
- `apps/web/src/server/actions/chat.ts`

---

### 6. Cost hints from registry (Phase 1.4.G)

`formatCostHint(model)` reads `cost_hint` from the video-models registry. `director-tools.ts` no longer hardcodes dollar ranges like `$0.20–$0.60`; all cost language is driven from the registry.

**Pointers:**
- `packages/core/src/media/prompt-cost.ts`
- `apps/web/src/server/lib/director-tools.ts`

---

### 7. Eval harness (Phase 1.4.H)

Three-level eval pyramid under `packages/core/src/llm/eval/`:

| Level | File | Cost | Gate |
|---|---|---|---|
| Snapshot tests | `snapshot.test.ts` | Free | Regression (inline file snapshots) |
| Static rubric | `rubric.ts` + `rubric.test.ts` | Free | Boolean checks + axis_coverage_score 0–7 |
| LLM judge | `llm-judge.ts` + `llm-judge.test.ts` | ~$0.02 cap | faithfulness mean ≥ 8; skipped without `OPENROUTER_API_KEY` |

97 snapshot tests across all 9 `build*Prompt` functions × fixture combos. 5 canonical scene fixtures (quiet/action/dialogue/wide/multi-character) + 2 script fixtures (15s/60s) in `snapshot-fixtures.ts`.

The rubric immediately caught Veo 3.1 axis-coverage gaps (scored 3–4/7 vs target 5/7) that no unit test had flagged — see Open follow-ups.

**Pointers:** `packages/core/src/llm/eval/{snapshot-fixtures,snapshot,rubric,llm-judge}.ts`

---

### 8. Migration (Phase 1.4.I)

Forward migration (`migrate-phase-1.4.ts`) fills new `Scene`, `Script`, `Character` fields with null/defaults. Voice IDs are remapped (the only true data transform). Idempotent — reports `0 projects updated` on second run.

Inverse migration (`migrate-phase-1.4-inverse.ts`) strips new fields and restores prior structure. **Voice IDs are NOT reverted** — the old IDs are dead in ElevenLabs.

**Pointers:**
- `packages/core/src/llm/migration-1.4.ts`
- `scripts/migrate-phase-1.4.ts`
- `scripts/migrate-phase-1.4-inverse.ts`

---

## Recurring patterns introduced

### Pattern A — Engine-aware dispatch

Single entry function (`buildVideoPrompt`) dispatches by `model` to per-engine builders. Avoids monolithic if-else inside a single builder function. Each engine builder is independently testable and independently updatable. Could extend to image-prompts when more models join the pool.

### Pattern B — Static prefix + cache boundary

Prompt structure: cacheable static prefix (role + rules + examples) → cache marker → dynamic suffix (per-turn state). Anthropic auto-caches the longest shared prefix across turns. The `<!-- CACHE BOUNDARY -->` marker is descriptive; `cache_control` applies to the whole message at the SDK level.

### Pattern C — XML-block prompts over free prose

`<role>`, `<engine_constraints>`, `<examples>`, etc. Improves Sonnet 4.6 instruction-following vs prose paragraphs. Also makes prompts diffable in git and auditable section-by-section.

### Pattern D — Fire-and-forget webhook chain

Webhook handler dispatches a downstream server action with `void promise.then(warn).catch(warn)`. The dossier→reference-image chain uses this pattern. **Caveat:** serverless lambdas may freeze before the chained promise resolves. Durability is best-effort; if reference_image is null, the next first-frame regen retriggers the chain.

### Pattern E — Resolved upstream, raw discarded

`resolveAudioMode` produces the canonical `audio_mode` value. All prompt builders consume the resolved value, not the raw scene field. The F73 fix (Seedance `silent_tts` bypass) demonstrated that consuming raw fields directly causes silent regressions when resolution logic is updated.

---

## Lessons learned

1. **SDK behaviour is not always documented.** OpenRouter's SDK silently ignored request-level `providerOptions.anthropic.*`; prompt cache markers had to move to message-level. The hardcoded cache from earlier phases was non-functional for weeks without any warning.

2. **F29-style production drift is real.** 4 of 6 voice IDs went missing over 5 months. Periodic reverification is essential. `scripts/voice-pool-verify.sh` institutionalises this; run it before every ship.

3. **Eval before ship.** The 1.4.H rubric caught Veo 3.1 axis-coverage gaps immediately. Static rubrics + LLM judges are cheap; integrate them early — do not wait until a full audit.

4. **Plan-vs-reality adapters.** The 1.4.D plan said "modify `generateCharacterDossierAction` to chain reference-image generation inline". Reality required dispatching via the webhook layer to avoid action-timeout failures. Document deviations; future plans should account for action-vs-webhook timing constraints.

5. **Migration mapping is structural, not transformational.** Forward migration fills new fields with nulls; the LLM backfills on next regeneration. This avoids LLM cost during migration and keeps migrations fast and reversible. Voice-ID remap is the only exception — a true data transform with no safe inverse.

---

## Open follow-ups (deferred to post-1.4)

- **Veo 3.1 axis coverage** — rubric scored 3–4/7 (vs target 5/7). Builder needs a `Framing:` line and explicit audio direction. (`1.4.H` finding.)
- **9:16 aspect reminder** — not embedded in any prompt builder; currently flows only via `VideoPromptOutput.aspect_ratio` metadata. Consider embedding in the prompt for model redundancy. (`1.4.H` finding.)
- **`_seedance-shared.ts` rename** — now imported by image-prompts too; the name is misleading. Rename to `_cinematography-shared.ts` at next opportunity.
- **F31 (eleven_v3 route), F33 (voice-design author), F88 (LLM-mediated prompt authoring)** — deferred to Phase 1.5+ per spec.
- **`MANGO_DEFAULT_NARRATOR_VOICE_ID` in prod** — verify it does not point to the retired Rachel ID before going live.
