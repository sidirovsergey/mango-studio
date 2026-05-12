# Phase 1.4 — Prompt Audit · Consolidated Summary

_Audit dates 2026-05-12. Six prompt files in `packages/core/` + `apps/web/src/server/lib/`, four layers, four skill rubrics._

## TL;DR

**77 findings across 4 layers; 13 critical.** The system produces bad results for four compounding reasons, in order of leverage:

1. **No structure in the scene description.** Grok writes one Russian paragraph per scene. Image and video models therefore have no shot size, no camera move, no lighting recipe, no lens, no audio direction to work with. They invent each axis independently per scene, which is why scenes 1 / 2 / 3 don't look like the same cartoon. ([F1, F2, F57](#)).
2. **One video prompt for five engines.** Seedance Lite, Seedance 2.0, Veo 3.1, Kling 2.5, LTX all receive the same string. None of the engine-specific grammars (Veo blocks, Seedance time-segments, Kling beat markers) is honoured. ([F65](#)).
3. **The voice pool may not be what we think it is.** MCP returned anomalous payloads suggesting two distinct voice_ids (Antoni, Arnold) both alias to Adam in production. **Unverifiable from this machine — production API key required.** If true, every "warm male" and "serious male" character is rendering as the same voice. ([F29](#)).
4. **No few-shot examples on Director Agent.** Sonnet handles the verbose Russian rules well today, but every prompt edit is one regression away from Phase 1.2.5's hallucination class of bug. ([F17, F81](#)).

Everything else (no Visual Theme lock, dead `composition_hint` field, Russian descriptions to English-biased models, no audio direction for Seedance, no eval harness, no prompt-caching) is downstream of these four.

## Severity-1 (production hot)

| F | Layer | Finding |
|---|---|---|
| **F29** | Voice | **Voice pool ids may resolve to wrong voices in production.** Unverifiable from MCP (free plan); needs `curl https://api.elevenlabs.io/v1/voices?category=premade` with production key. |
| **F1, F2** | Director | Scene description is unstructured Russian paragraph; no Visual Theme lock; downstream cinematography has nothing to enforce. |
| **F17** | Director | Director Agent has zero few-shot examples for tool routing. |
| **F33** | Voice | `buildVoicePrompt` is a resolver, not a prompt author — no 7-axis voice description authored anywhere. |
| **F53** | Cinematography | Dossier multi-panel composition fights downstream first-frame gen with a full paragraph of negative instructions. Self-inflicted. |
| **F57** | Cinematography | `composition_hint` field is dead code (never populated). |
| **F65** | Cinematography | One video prompt for five engines. |
| **F66** | Cinematography | No audio direction for Seedance 2.0. Random ambient sound is generated and then mux'd over by TTS. |
| **F67** | Cinematography | No time-segmented prompts for >5s scenes. |
| **F68** | Cinematography | `motion_rule` strings are content-free ("short cinematic motion, single beat"). No cinematic verbs. |
| **F81** | Prompt-eng | Zero `<example>` blocks across all prompts. |
| **F88** | Prompt-eng | No prompt-producing-prompt for scene / first-frame / voice authoring — all string concatenation in code. |
| **F89** | Prompt-eng | No eval harness. Every prompt change is hand-validated. |

## Finding inventory

| Layer | Findings | Critical | File |
|---|---|---|---|
| Inventory | n/a | n/a | [01-inventory.md](./01-inventory.md) |
| Director (script + agent + chat + refine + tools) | F1–F28 | 5 (F1, F2, F3, F4, F17) | [02-director-layer-findings.md](./02-director-layer-findings.md) |
| Voice (pool + TTS routing + settings) | F29–F38 | 2 (F29, F33) | [03-voice-layer-findings.md](./03-voice-layer-findings.md) |
| Cinematography (avatar / dossier / first-frame / video) | F50–F78 | 6 (F53, F57, F65, F66, F67, F68) | [04-cinematography-layer-findings.md](./04-cinematography-layer-findings.md) |
| Prompt-engineering meta (XML / few-shot / output / cache / eval) | F80–F89 | 4 (F81, F86, F88, F89) | [05-prompt-engineering-meta-findings.md](./05-prompt-engineering-meta-findings.md) |
| **Totals** | **77** | **13** | |

(Numbering gaps F39–F49 and F79 were reserved during parallel passes; intentionally unused for clarity.)

## Dependency graph (work order)

```
                                    ┌─────────────────────────┐
                                    │  F29 Pool verification  │  ← independent; production API key
                                    │  (separate workstream)  │
                                    └─────────────────────────┘

  ┌───────────────────────────────┐
  │ Tier 1 — Schema foundation    │  must land first; nothing else compiles correctly without it
  │                               │
  │  F1   Visual Theme block       │  → adds visual_theme: { palette, lighting, lens, motion } at script root
  │  F2   Structured scene fields  │  → adds composition / camera / lighting / audio_direction per scene
  │  F9   description_en mirror    │  → English description alongside Russian, for image/video models
  │  F10  tier in script-author    │  → Grok knows economy vs premium when writing
  └───────────────────────────────┘
                  │
                  ▼
  ┌──────────────────────────────────────┐         ┌─────────────────────────────────┐
  │ Tier 2a — Cinematography rewrites    │         │ Tier 2b — Voice tooling         │
  │  (parallelizable with 2b)            │         │  (parallelizable with 2a)       │
  │                                      │         │                                 │
  │  F65 engine-aware video prompts      │         │  F30 per-character settings     │
  │  F66 audio direction lines           │         │  F33 voice-design author        │
  │  F67 time-segmented for >5s          │         │  F35 narrator persona           │
  │  F68 real camera verbs               │         │  F36 set_character_voice tool   │
  │  F53 dossier reference-cells refactor│         │  F37 voice-canary in diff/merge │
  │  F57 wire composition_hint           │         │                                 │
  └──────────────────────────────────────┘         └─────────────────────────────────┘
                  │                                                 │
                  └────────────────────┬────────────────────────────┘
                                       ▼
                       ┌─────────────────────────────────┐
                       │ Tier 3 — Director Agent polish  │
                       │                                 │
                       │  F17/F81 few-shot examples       │
                       │  F80    XML structure           │
                       │  F83    long-context reorder    │
                       │  F84    role separation         │
                       │  F86    prompt caching          │
                       │  F87    extended thinking       │
                       └─────────────────────────────────┘
                                       │
                                       ▼
                       ┌─────────────────────────────────┐
                       │ Tier 4 — Eval harness           │
                       │  F89 snapshot + rubric + round  │
                       │       -trip tests               │
                       └─────────────────────────────────┘
```

## Effort estimate (rough, in "subagent-day" units)

| Tier | Effort | Cost-significant? |
|---|---|---|
| **F29 verification** | 0.25 day (curl + reconcile) | no |
| **Tier 1 — schema foundation** | 1.5 day (schema change + migration + types + tests) | no |
| **Tier 2a — cinematography** | 2 day (per-engine prompt authors, ~$5 round-trip during) | yes, fal credits |
| **Tier 2b — voice tooling** | 1.5 day (schema + settings surface + canary test + tool) | yes, elevenlabs credits |
| **Tier 3 — Director polish** | 1 day (XML/few-shot/cache) | no |
| **Tier 4 — eval harness** | 1 day | no |
| **Total** | **~7 subagent-days** | ~$20-50 in credits |

This is appropriate to scope as **Phase 1.4** in the project's phase log, with the standard handoff pattern (spec + plan + Subagent-Driven execution per Phases 1.2 / 1.3 / 1.3.5).

## What this audit deliberately does not change

- **Mango's brand voice (RU-first, character-first cartoons).** All Russian prompts stay Russian for the user-facing TTS; we add English mirrors only for downstream models that need them.
- **The Faraday-cage architecture.** All prompt text continues to live in `packages/core/`; nothing leaks to the auth/payments ring.
- **fal API as source of truth for pricing.** Hardcoded costs in tool descriptions (F20) get removed, replaced with model-registry lookups; we don't introduce parallel pricing tables.
- **Existing Phase 1.3.5 design rules** (the 8 architectural rules in `project_phase1.3.5_post_polish.md`).
- **`voice_id` permanence post-render.** F36 (set_character_voice) refuses the swap if any audio has been rendered.
