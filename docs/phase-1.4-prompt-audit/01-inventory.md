# Phase 1.4 — Prompt Audit · Inventory

_Compiled 2026-05-12 from `C:\mango-studio\packages\core\` + `apps\web\src\server\lib\`._

The Mango pipeline's prompt surface area is bigger than CLAUDE.md hinted. Five files emit text that ultimately steers a downstream model (LLM, image, video, or voice).

| # | Surface | File | Downstream model | Language | Lines |
|---|---|---|---|---|---|
| 1 | `SCRIPT_SYSTEM_PROMPT` | `packages/core/src/llm/prompts.ts` | Grok 4.1 Fast | RU | 64 |
| 2 | `buildScriptUserPrompt` | same | Grok 4.1 Fast | RU | 10 |
| 3 | `buildScriptPrompt` (assembles 1+2 + existing-characters block) | same | Grok 4.1 Fast | RU | 28 |
| 4 | `REFINE_SYSTEM_PROMPT` (one-sentence scene refine) | same | Grok 4.1 Fast | RU | 4 |
| 5 | `CHAT_SYSTEM_PROMPT` (general chat fallback) | same | Sonnet 4.6 | RU | 6 |
| 6 | `buildDirectorSystemPrompt` (the big one) | same | Sonnet 4.6 | RU | 110 |
| 7 | `buildAvatarPrompt` (1:1 portrait) | `packages/core/src/media/prompts.ts` | nano-banana (2/pro) | RU | 22 |
| 8 | `buildDossierPrompt` (16:9 multi-pose model sheet) | same | nano-banana (2/pro) | RU | 24 |
| 9 | `buildFirstFramePrompt` (image→image continuity + composition) | `packages/core/src/media/video-prompts.ts` | nano-banana (2/pro) | EN | 47 |
| 10 | `buildVideoPrompt` (text + image → video) | same | Seedance Lite / Seedance 2.0 / Veo 3.1 / Kling 2.5 / LTX | RU+EN mix | 31 |
| 11 | `buildVoicePrompt` (voice_id resolver, no actual prompt) | same | ElevenLabs (`fal-ai/elevenlabs/tts/multilingual-v2`) | n/a | 23 |
| 12 | `VOICE_POOL` (6 voice_ids w/ tone labels) | `packages/core/src/media/voices.ts` | ElevenLabs | RU labels | 50 |
| 13 | 21 × tool descriptions | `apps/web/src/server/lib/director-tools.ts` | Sonnet 4.6 (tool routing) | RU | 624 |

**Total prompt text shipped to downstream models on every project: ~1 050 lines of Russian (and ~50 of mixed RU+EN) before any user content is added.**

## Models in production (cross-ref with CLAUDE.md)

| Pipeline step | Model | Where the prompt lives |
|---|---|---|
| Script generation (brief → 2-8 scene JSON) | `x-ai/grok-4.1-fast` (OpenRouter) | #1–3 |
| Single-scene refine | Grok 4.1 Fast | #4 |
| General chat (pre-Director Agent) | Sonnet 4.6 | #5 |
| Director Agent (Stage 03/04 chat with 21 tools) | Sonnet 4.6 | #6, #13 |
| Character avatar (1:1) | `fal-ai/nano-banana-2` (economy) / `fal-ai/nano-banana-pro` (premium) | #7 |
| Character dossier (16:9 model sheet) | nano-banana-2 / pro | #8 |
| Scene first frame (image-to-image w/ char ref) | nano-banana-2 / pro | #9 |
| Scene video (image-to-video) | Seedance Lite / Seedance 2.0 Pro / Veo 3.1 / Kling 2.5 / LTX | #10 |
| Scene voice / narrator TTS | ElevenLabs `multilingual-v2` via fal | #11, #12 |
| Mux & master concat | `fal-ai/ffmpeg-api/*` | (no prompt) |

## What is NOT yet captured

- **No `voices.md` voice bible.** The 6 voice_ids in `voices.md` (file #12) are tagged with `gender` and a one-word `tone` (нейтральный / молодой / мягкий / тёплый / серьёзный) and a `supports_ru` boolean — but no 7-axis description, no per-voice settings, no reference clip, no v3 / v2 distinction. Continuity bug source.
- **No per-scene Visual Theme.** The script generator emits `scene.description` as one paragraph. No `composition_hint` field is populated by Grok (only by hand in the UI). Color palette, lighting recipe, lens character, motion language are never locked.
- **No engine-aware scene prompt authoring.** The same `scene.description` is later wrapped by `buildVideoPrompt` and sent unchanged to Seedance Lite / Seedance 2.0 / Veo / Kling / LTX — five engines with different grammars. The only difference between engines in our code is `include_dialogue = meta?.has_native_audio === true`.
- **No negative-prompt guidance for Seedance.** Seedance specifically supports `Avoid: ...` lines. We never emit them.
- **No audio direction line.** Seedance 2.0 generates audio natively and degrades to random ambient sound when no audio line is provided. Veo 3.1 native audio also benefits. Currently we only emit the dialogue line.
- **No time-segmented prompt grammar.** Scenes 10s+ should be `0–3s / 3–6s / 6–10s` per Seedance reference; we send one declarative paragraph regardless of duration.
- **Russian scene descriptions sent to image / video models.** nano-banana / Seedance / Veo / Kling are all English-biased. Whether Russian works depends on the model — needs round-trip test.
- **No engine-routing logic at the prompt-author layer.** Grok does not know whether the user is on economy or premium when it writes `scene.description`. So prompts that need photoreal physics (Sora-style cause/effect) and prompts that need anime motion (Kling) come out identical.

## Files NOT containing prompts (verified)

- `llm/character-diff-merge.ts` — pure data diff
- `llm/migration.ts` — schema migration (`voiceover` string → `dialogue` object)
- `llm/normalize.ts` — idempotent schema-up
- `llm/sync-hint.ts` — rule-based substring match for "X mentioned in scene Y"
- `llm/factory.ts`, `llm/openrouter-provider.ts`, `llm/mock-provider.ts` — transport, no prompt content
- `media/FalMediaProvider.ts`, `media/factory.ts`, `media/queue/*` — transport
- `media/scene-versions.ts`, `media/scene-types.ts` — schemas
- `media/audio-mode.ts` — RU/EN auto-detect for native-vs-silent_tts routing (logic, not prompt)
- `media/storage/*` — storage adapter

If a prompt is added later, the inventory below should be the first thing updated.
