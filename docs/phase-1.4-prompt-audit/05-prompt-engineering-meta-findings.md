# Phase 1.4 — Prompt Audit · Prompt-Engineering Meta Findings

_Cross-cutting structural concerns. Most patterns here are already noted layer-specific in 02 / 03 / 04 — this pass aggregates the ones that touch **every** prompt._

Scored against `prompt-engineering-baseline/SKILL.md`. Findings numbered **F80+** (gap F79–F80 unused; F50–F78 cinematography, F29–F38 voice, F1–F28 director).

---

## A. XML structure — universal absence

### F80 — Zero XML separation in any prompt (Severity 2, important)

**What.** None of the 5 prompt surfaces use `<role>`, `<engine_constraints>`, `<examples>`, `<task>` tags. Every prompt is flat Russian text with section markers (`ПРАВИЛА:`, `ПЕРСОНАЖИ:`, `СЦЕНАРИЙ И СЦЕНЫ:`). Per the skill §"Structure prompts with XML tags": Sonnet's instruction-recall is measurably higher with XML separation, especially when the prompt mixes >2 content kinds (rules + state + examples + query).

**Why it matters.** Three concrete failure modes:

1. When the project state grows (script JSON with 10 scenes + 6 characters + assets) it bleeds into the rules section visually; Sonnet has to re-scan rules to disambiguate "did the rule mean this character or that one".
2. Few-shot examples (post F17) can't be cleanly delimited without `<examples><example>...</example></examples>`. Mixing them with section markers loses the "this is illustrative, not literal" signal.
3. Prompt-caching boundaries are harder to identify and place when no structural markers exist.

**Recommended fix.** Wrap every system prompt in this template:

```xml
<role>...one paragraph...</role>

<engine_constraints>
- ...
</engine_constraints>

<behavioral_rules>
- ...
</behavioral_rules>

<examples>
  <example label="X intent">
    <input>...</input>
    <expected_tool_call>...</expected_tool_call>
  </example>
  ...
</examples>

<project_state>
  ...generated per request...
</project_state>

<task>
  ...the actual instruction...
</task>
```

Apply to: `SCRIPT_SYSTEM_PROMPT`, `buildDirectorSystemPrompt`, `REFINE_SYSTEM_PROMPT`, `buildFirstFramePrompt`, `buildVideoPrompt` per-engine variants, `buildAvatarPrompt`, `buildDossierPrompt`.

---

## B. Few-shot — universal absence

### F81 — Zero `<example>` blocks across all prompts (Severity 1, critical for Director Agent)

**What.** Anthropic best practice #3 says examples are "the single most reliable steering technique." Currently:

- `SCRIPT_SYSTEM_PROMPT` — partial JSON template (not a filled exemplar)
- `REFINE_SYSTEM_PROMPT` — none
- `CHAT_SYSTEM_PROMPT` — none
- `buildDirectorSystemPrompt` — none
- `buildAvatarPrompt` / `buildDossierPrompt` / `buildFirstFramePrompt` / `buildVideoPrompt` — none

**Why it matters.** Phase 1.2.5's tool-call hallucination bug (Grok said "удалил персонажа" without invoking the tool) is the textbook failure mode of skipping examples. Sonnet handles the verbose Russian rules better than Grok did but is one prompt-edit away from regression.

**Recommended fix.** Each Director Agent system prompt should embed 6–10 examples covering the hardest ambiguous cases (full list in director-layer F17). Each per-engine video prompt should embed 1 input/output pair from a previously-approved scene (engine-matched, aspect-matched, complexity-matched).

This is a **net-new artifact** to author. Suggested location: `packages/core/src/prompts/examples/<surface>.ts` with each example as a string-template, imported into the prompt builders.

---

## C. Output format specification — schema by description vs schema by example

### F82 — Schema described, not demonstrated (Severity 2, important — `SCRIPT_SYSTEM_PROMPT`)

**What.** `SCRIPT_SYSTEM_PROMPT` shows a half-filled JSON template with literal placeholder strings ("заголовок мультика (до 120 символов)"). The skill §"Control output format precisely" rule 2 says: "Match prompt style to desired output. If you want JSON out, write the prompt with JSON examples — don't write it in markdown."

**Why it matters.** Grok and Sonnet both produce more reliable JSON when they've seen at least one fully-filled valid example than when given a template. We currently rely on the partial template + schema validation downstream to catch malformed output. Schema validation costs a retry round-trip when it fails.

**Recommended fix.** Replace the half-filled template in the system prompt with:

1. A `<schema>` block (TypeScript types or JSON Schema) for hard contract.
2. A `<examples>` block with 1–2 fully filled exemplars (different durations, character counts).

This pairs with F5 (storyboard skill — show by example).

---

## D. Long-context layout

### F83 — Project state in the middle of `buildDirectorSystemPrompt` (Severity 3, hygiene)

**What.** Skill §"Long-context layout" recommends "longform data at the top, the actual query at the bottom. Tests show up to +30% quality on long inputs." Currently `buildDirectorSystemPrompt` puts behavioral rules at the top → tool list → project state → instruction to "respond in RU". The behavioral rules are static across all calls; the project state is what changes per turn. Best practice would be: rules at top (cacheable), project state at bottom (volatile).

**Why it matters.** Two angles:

1. With XML structure (F80) the cache boundary becomes clean: cache everything except `<project_state>` and `<task>`. Right now caching either captures all of it (and invalidates on every project change) or none of it.
2. Quality angle is small compared to (1) — Sonnet handles mid-context fine for this prompt size. But for projects with 60-90s scripts (30+ kB of JSON), inverted layout adds up.

**Recommended fix.** Reorder system prompt sections: role → engine_constraints → behavioral_rules → examples → (cache boundary) → project_state → task.

---

## E. Role separation

### F84 — Four prompts overlap on "role" (Severity 2, important)

**What.** Per skill §"Give the model a role":

- `SCRIPT_SYSTEM_PROMPT` — "Ты — Mango, AI-режиссёр коротких мультиков."
- `REFINE_SYSTEM_PROMPT` — "Ты — Mango, AI-режиссёр."
- `CHAT_SYSTEM_PROMPT` — "Ты — Mango, AI-режиссёр коротких мультиков. Помогаешь пользователю..."
- `buildDirectorSystemPrompt` — "Ты — Mango, AI-режиссёр коротких мультиков..."

**All four claim the same role with slightly different wording, and they have different model targets, different output expectations, and different toolsets.** The skill explicitly warns: "Director Agent and Scene Prompt Author in one system prompt produces flabby output. Split them."

We did split them, but we used identical role descriptions, so the model sees four overlapping personas where each prompt's role description should narrow what THIS prompt does, not just brand it.

**Why it matters.** Mostly cleanliness, but: when we add the Scene Prompt Author surfaces (post F65 split per engine), having all of them named "Mango — AI-режиссёр" loses signal. A future agent reading the code will think they're the same prompt.

**Recommended fix.** Distinct role tags per surface:

| Surface | Role |
|---|---|
| `SCRIPT_SYSTEM_PROMPT` | "Mango — Screenwriter & Storyboard Author. You convert a brief into a structured shot-list JSON." |
| `REFINE_SYSTEM_PROMPT` | "Mango — Scene Editor. You revise a single scene's structured fields per the user's instruction, preserving all unspecified fields." |
| `CHAT_SYSTEM_PROMPT` | "Mango — Pre-production Concierge. Conversational guide before the Director Agent takes over at Stage 03." |
| `buildDirectorSystemPrompt` | "Mango — Director Agent. You orchestrate the project through 21 tools and never claim to have done something you haven't called a tool for." |
| `buildVideoPrompt` (per engine) | "Mango — Scene Prompt Author for Seedance 2.0 / Veo 3.1 / Kling 2.5. You translate a structured shot into engine-specific grammar." |
| `buildAvatarPrompt` / `buildDossierPrompt` | "Mango — Character Visual Designer. You author single-character reference images for downstream scene continuity." |

---

## F. Cost-aware routing

### F85 — Routing matches skill guidance, with one exception (Severity 4, hygiene)

**What.** CLAUDE.md and skill §"Cost and model routing" both target this routing:

| Step | Recommended | Current | Match? |
|---|---|---|---|
| Brief → script outline | Grok 4.1 Fast | Grok 4.1 Fast | ✔ |
| Director Agent | Sonnet 4.6 | Sonnet 4.6 | ✔ |
| Scene Prompt Author | Sonnet or Grok | n/a (not split yet) | n/a |
| Voice Prompt Author | Sonnet | n/a (no voice prompt authored) | n/a |
| Audit / QA pass | Opus 4.7 | n/a (no QA layer) | n/a |
| Single-scene refine | Grok or Sonnet | Grok 4.1 Fast | ✔ |
| General chat | Sonnet | Sonnet (per CLAUDE.md) | ✔ |

**Exception.** When `regenSceneTextAction` calls into `REFINE_SYSTEM_PROMPT`, it runs on Grok 4.1 Fast. For an isolated single-sentence refine that's appropriate. But if F11 / F13 land (refine sees full surrounding context, returns structured JSON patch), the task complexity rises — Grok may struggle with the structured edit. Route should be re-evaluated.

**Recommended fix.** No action now. Re-route when F13 lands.

### F86 — Prompt caching not configured (Severity 2, important)

**What.** No `cache_control: { type: 'ephemeral' }` markers anywhere. Sonnet 4.6 + Vercel AI SDK supports prompt caching; the static portion of `buildDirectorSystemPrompt` is ~6 kB (rules + tool descriptions) and would be a cache hit on every turn after the first.

**Why it matters.** Director Agent turns are the hottest LLM cost in the project after script regen. Caching cuts the per-turn cost ~10× on the cached prefix. Compounds with every turn the user takes in a Director session.

**Recommended fix.**

1. Insert cache marker between behavioral_rules section and project_state section (depends on F83 reorder).
2. Cache the tool definitions array (they're stable per session).
3. Re-measure cost on a 10-turn Director conversation — expect ~80% reduction on input tokens for turns 2+.

---

## G. Chain-of-thought / thinking

### F87 — Sonnet extended thinking not used for tool-routing decisions (Severity 3, hygiene)

**What.** Skill §"Chain-of-thought / thinking" lists Mango's case as a fit: "Multi-character scene with continuity constraints — who knows what, who has what prop" and "Diagnosing why a generated clip failed an audit and proposing a fix." Currently the Director Agent emits tool calls directly with no `<thinking>` step.

**Why it matters.** On ambiguous user inputs ("сделай героя круче, и сцену 3 тоже"), a thinking step would let Sonnet enumerate "which character is 'герой'? what does 'круче' mean for this character? is 'и сцену 3' a separate request requiring a second tool? is one of these a pending action?" before emitting calls. Currently Sonnet does this implicitly — extended thinking would make it explicit and auditable.

**Recommended fix.** Add `thinking: { type: 'enabled', budget_tokens: 2000 }` to the Director Agent API call. Pair with a system prompt instruction: "Before emitting a tool call, briefly think through: (a) which entity in the project state the user is referring to; (b) whether the request is one action or multiple; (c) if multiple pending-actions are implied, which is first."

---

## H. Prompts producing prompts

### F88 — No prompt-producing-prompt anywhere (Severity 1, critical given audit goal)

**What.** Skill §"prompt-engineering-baseline" subtitle: "Anthropic prompt engineering best practices, adapted for the case of authoring prompts that will be consumed by downstream generative models." Mango should have at minimum:

- A Scene Prompt Author prompt (input: structured shot from script JSON + tier + engine; output: engine-specific video prompt).
- A Voice Design Author prompt (input: character card; output: 7-axis voice description for `/text-to-voice/design`). Tied to F33.
- A First-Frame Prompt Author prompt (input: structured shot + Visual Theme + character refs; output: nano-banana prompt).

Currently `buildVideoPrompt`, `buildFirstFramePrompt`, `buildAvatarPrompt`, `buildDossierPrompt` are **string concatenation functions**, not LLM prompts producing prompts. They author the prompt themselves in code with hardcoded English/Russian text.

**Why it matters.** String concatenation can't adapt to:

- engine selection (per F65)
- shot complexity (a tight close-up dialog beat vs a wide environmental establish)
- Visual Theme variation (high-key bright vs low-key chiaroscuro)
- character ensemble configurations (1 character vs 3)

A small dedicated LLM step (Sonnet or Grok) takes the structured shot and the Visual Theme and writes a prompt that *follows* the engine's grammar — the way a working human director would.

**Recommended fix.** This is the biggest architectural lift in the audit. Two-stage authoring:

1. **Stage 1 (LLM, in core):** Scene Prompt Author. Input: structured shot + visual theme + tier + engine_id. Output: engine-specific prompt string + image_refs allocation hints + audio_direction.
2. **Stage 2 (code, deterministic):** wrap with file-attachment + duration + aspect_ratio for the fal API.

Same pattern for First-Frame: LLM step that picks framing / lighting recipe / lens character based on the shot, code step that wraps with the API parameters.

This adds 1 Sonnet call per scene first-frame and 1 per scene video — ~$0.01-0.03 per scene. Recoverable from the quality lift; should be benchmarked against the baseline.

---

## I. Anti-patterns audit (skill §"Anti-patterns")

| # | Anti-pattern | Triggered? | Evidence |
|---|---|---|---|
| 1 | Adjective soup ("8K, masterpiece") | ✘ ✔ | None in our prompts. Clean. |
| 2 | Mixing roles | ◔ | F84 (4 prompts share role description, but they ARE split by surface) |
| 3 | Examples that don't match engine | n/a | We have no examples (F81) |
| 4 | No XML when content is mixed | ✔ | F80 — universal |
| 5 | Negative-only instructions | ✔ | F52, F55, scattered "Не делай / Не комментируй / БЕЗ ..." rules |
| 6 | Skipping eval | ✔ | No eval harness exists — F89 below |
| 7 | Variable interpolation with no defaults | ◔ | `composition_hint ?? ''` (F57) — empty-string fallback is silent |
| 8 | Long-context layout inverted | ✔ | F83 |
| 9 | Free-form chain-of-thought for trivial tasks | ✘ ✔ | Not done |
| 10 | One prompt for all engines | ✔ | F65 — the cardinal sin |

**6 of 10 anti-patterns triggered.** Clean ones: keyword soup, mixing engines/examples, free-form CoT bloat. Triggered ones: structure (F80), examples (F81), eval (F89), long-context (F83), negative-only (F52/F55), one-prompt-many-engines (F65).

---

## J. Eval harness

### F89 — No eval harness for any prompt (Severity 1, critical infrastructure)

**What.** Skill §"Evaluation — validate before shipping a prompt to production": "Never ship a prompt template to a downstream model without an eval pass." Mango ships every prompt template based on manual smoke tests. There is no:

- regression test set ("for user input X, expected tool Y")
- "golden prompt" snapshot for `buildVideoPrompt` (so we'd notice when a refactor breaks it)
- round-trip test on >1 engine
- voice fidelity check between reference clip and new generation (tied to F34)
- structured "did the generated prompt have all 7 cinematography axes?" rubric

**Why it matters.** Every change to a prompt is hand-validated. As the prompts grow more sophisticated (post F1, F2, F65) the surface that can regress grows quadratically.

**Recommended fix.** Build a minimal eval harness in `packages/core/test/prompt-eval/`:

1. **Snapshot tests** — for each `build*Prompt` function, fixed-input → text snapshot. Catches accidental regressions in prompt assembly.
2. **Static rubric tests** — for each generated video prompt, assert: contains a camera verb, contains an audio line, contains a duration, contains an aspect ratio reminder, doesn't contain dead `composition_hint ?? ''` artifacts.
3. **LLM-judge tests** — Sonnet 4.6 evaluates a sample generated prompt against the 7-axis cinematography rubric. Pass/fail.
4. **Round-trip generation tests** (CI optional, opt-in for budget) — for 3-5 canonical scenes, generate via higgsfield MCP on 2 engines and store the URL + a Sonnet-graded score. Diff across PR runs.

The first three are free and should be CI gates. The fourth costs credits and should run on `main` only.

---

## Sub-totals

| Theme | Findings | Severity |
|---|---|---|
| XML structure | F80 | important |
| Few-shot | F81 | **critical** (load-bearing for Director Agent reliability) |
| Output format by example | F82 | important |
| Long-context layout | F83 | hygiene |
| Role separation | F84 | important |
| Cost routing | F85, F86 | F85 hygiene, **F86 important** (10× cost reduction available) |
| Chain-of-thought | F87 | hygiene |
| Prompts producing prompts | F88 | **critical** (the architectural lift) |
| Eval harness | F89 | **critical infrastructure** |

**Total: 10 findings, of which 4 are critical (F81, F86, F88, F89).**

Most overlap meaningfully with earlier findings — F80 enables F86 (cache boundary); F88 absorbs F65 (engine-specific) and F66/F67/F68 (cinematography); F89 protects everything else from regression.
