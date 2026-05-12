# Phase 1.4 — Manual E2E Checklist

**Status:** awaiting live session with maintainer.

Per [feedback_e2e_with_user_before_merge](memory:feedback_e2e_with_user_before_merge) rule, this walkthrough must complete BEFORE merge to main. Static checks (typecheck + biome + vitest + Next build) cannot detect Director tool-routing regressions, voice-lock bypasses, silent_tts drift, or prompt builder failures; only a live walkthrough can.

## Pre-flight

- [ ] Branch `claude/phase-1.4` checked out locally or Vercel preview deployed.
- [ ] Migrations applied on staging Supabase:
  - [ ] Dry-run: `pnpm exec tsx scripts/migrate-phase-1.4.ts --env=staging --dry-run` — verify per-project stats look reasonable (no unexpected null counts).
  - [ ] Apply: `pnpm exec tsx scripts/migrate-phase-1.4.ts --env=staging` — confirm projects' `script.tier`, new `Scene` fields (`description_en`, `composition`, etc.) exist (null is expected for backfilled fields).
  - [ ] Verify `narrator_voice.tts_voice_id` remapped: any project that had Rachel/Domi/Antoni/Arnold IDs now shows Janet/Jessica/George/Daniel.
- [ ] ElevenLabs API check: all 6 voices in `VOICE_POOL` return 200 (run `scripts/voice-pool-verify.sh`).
- [ ] `MANGO_DEFAULT_NARRATOR_VOICE_ID` env: either unset (falls back to `VOICE_POOL[0]` = Janet) or points to a live ID. Confirm it is NOT the retired Rachel ID `21m00Tcm4TlvDq8ikWAM`.
- [ ] ENV variables in local `.env.local` or Vercel preview env:
  - [ ] `FAL_KEY` — real key.
  - [ ] `OPENROUTER_API_KEY` — real.
  - [ ] `MEDIA_PROVIDER=fal`, `LLM_PROVIDER=openrouter`.
  - [ ] `STORAGE_PROVIDER=fal_cdn`.
- [ ] `pnpm dev` (or preview build) starts without errors.

## 1. 30s test project (basic end-to-end)

- [ ] Create a new project titled «Тест 30 сек».
- [ ] Stage 01: select Premium tier, duration 30s.
- [ ] Stage 02: skip characters (no characters needed for this pass).
- [ ] Stage 03: generate script → LLM returns structured JSON with `visual_theme` populated (not null/undefined).
- [ ] Inspect script response: `script.visual_theme` and `script.tier` visible in DB (`Supabase SQL: select script->'visual_theme', script->'tier' from projects where ...`).
- [ ] Stage 04: storyboard renders inline — at least one scene card visible.
- [ ] Scene card shows `description_en` populated (not empty) after script generation; if null, trigger regenSceneText and verify it fills.
- [ ] Click 🖼️ Кадр on Scene 1 → job submits → first-frame version v1 appended → thumbnail visible in card.
- [ ] Click 🎬 Видео on Scene 1 → job submits → video version v1 appended → preview plays.
- [ ] Click 🎬 Финализировать ролик → ffmpeg concat job → `script.master_clip_versions.length === 1`.
- [ ] MasterClipModal opens → active master clip plays → download link accessible.

## 2. 60s test project with 2 characters and dialogue

- [ ] Create new project titled «Тест 60 сек, 2 персонажа».
- [ ] Stage 01: Premium tier, 60s.
- [ ] Stage 02: add 2 characters — e.g. «Кот» (male) and «Собака» (female). Generate dossier for each.
  - [ ] Verify `character.dossier.reference_image` populated for each (single-pose 1:1 URL, not the multi-panel `storage` URL — see F53 check in §5).
- [ ] Stage 03: generate script → verify at least one scene has `dialogue.text` in Cyrillic.
- [ ] Stage 04:
  - [ ] Scene with Cyrillic dialogue → pill shows `🤖 auto` or `🔇 silent_tts` (not `🎙️ native`).
  - [ ] Generate first-frame for that scene (see F53 check §5).
  - [ ] Generate video for that scene → silent video result (see F66 check §5).
  - [ ] Ask Director: «озвучь сцену 1» → ElevenLabs job → `voice_audio` version appended with correct `voice_id`.
  - [ ] Ask Director: «собери финальный клип сцены 1» → ffmpeg merge → `scene.final_clip.composed_from` set.
- [ ] English dialogue scene (add one or verify): `resolveAudioMode = native` → video has native audio → final_clip auto-set = active video (no mux required).
- [ ] Generate master clip → all scenes included → plays back.

## 3. First-frame and video version cycling

- [ ] Generate 5 first-frame versions for a scene → counter shows `5/5`, v5 active.
- [ ] 6th regeneration → oldest version dropped, counter stays `5/5`, new version = active.
- [ ] Click dot v3 → preview switches to v3 → rollback button `↺ откат на пред.` appears.
- [ ] Click rollback → active version changes to the one generated just before v3.
- [ ] Repeat above cycle for video versions.

## 4. Prompt editor modal

- [ ] Click ✏️ on scene first-frame prompt → modal opens with current prompt text.
- [ ] Edit text → click `▶ Применить и regen` → modal closes → new version appended with edited prompt in `version.prompt`.
- [ ] Esc / click backdrop → modal closes without saving.

## 5. Specific Phase 1.4 acceptance criteria

- [ ] **F53 fix — reference_image anchor:** Inspect the fal request payload for a first-frame generation on a scene that has characters. The `image_url` passed to fal MUST be `character.dossier.reference_image` (single-pose 1:1, e.g. `https://fal.media/...` with short UUID path). It must NOT be `character.dossier.storage` (multi-panel sheet). Verify via Supabase `media_jobs.request_input` or browser network tab.

- [ ] **F66 fix — silent_tts room tone:** Generate a video for a scene with Cyrillic dialogue and a Seedance 2.0 model. Check `media_jobs.request_input.prompt` in DB. The `[AUDIO]` section MUST contain the literal string `No dialogue, no music; ambient room tone only — voice dubbed in post`. No fabricated ambient or music descriptors. The rendered video should be silent (no speech, no music).

- [ ] **F17 Director routing — archive vs delete:**
  - Send «удали Кота» → Director calls `archive_character` (recoverable). Character moves to archived list; no confirmation modal. Undo via Director «восстанови Кота».
  - Send «удали Кота навсегда» → Director calls `delete_character` (pending confirm). Confirmation card appears. User confirms → character disappears permanently.
  - Send «у меня нет идей» → no tool call at all; Director replies conversationally with suggestions.

- [ ] **F36 voice lock — set_character_voice after audio rendered:**
  - Generate voice audio for Scene 1 (at least one voice_audio version exists).
  - Ask Director: «поменяй голос Кота» → action returns `voice_locked` error referencing the scene_id where audio is rendered.
  - Director message surfaces the error verbatim: e.g. «Нельзя сменить голос: сцена 1 уже имеет озвученный аудиофайл».

- [ ] **F86/F87 Director caching + thinking:**
  - Check OpenRouter dashboard (or Supabase `llm_jobs.response_raw`) — first turn shows no cache hit (full prompt tokens). Second or third turn in the same conversation shows `cache_read_input_tokens > 0`.
  - Verify thinking enabled: response includes reasoning tokens (OpenRouter dashboard shows `reasoning_tokens > 0` or `thinking` block in stream).
  - Cost per Director turn roughly reflects thinking overhead (expect ~2× vs no-thinking).

- [ ] **F29 voice pool — no 404s:**
  - Run `scripts/voice-pool-verify.sh` on production/staging → all 6 voice IDs return HTTP 200.
  - TTS generation succeeds end-to-end; no ElevenLabs 404 errors in Vercel function logs.

- [ ] **F30 voice settings — per-character override:**
  - Open character card for «Кот» in Stage 02 → advanced voice settings panel.
  - Change `stability` to a non-default value (e.g. 0.9 instead of default 0.5).
  - Generate voice TTS for a scene with «Кот» dialogue → verify the ElevenLabs request in `media_jobs.request_input.voice_settings.stability === 0.9`.

## 6. Eval harness sanity

- [ ] `pnpm --filter @mango/core test -- eval/snapshot` → all 97 snapshot tests green (no unexpected diff).
- [ ] `pnpm --filter @mango/core test -- eval/rubric` → all rubric checks pass thresholds.
- [ ] `OPENROUTER_API_KEY=$KEY pnpm --filter @mango/core test -- eval/llm-judge` → faithfulness mean ≥ 8.0; no individual score below 6.

## 7. Migration verification (legacy projects)

- [ ] Open a project created in Phase 1.3.5 (before 1.4 ship) → loads without errors.
- [ ] `script.tier` present (defaulted to `economy` or `premium` based on legacy project tier).
- [ ] `script.visual_theme` is null (expected — backfilled on next regen, not during migration).
- [ ] Narrator `tts_voice_id` is NOT a retired ID (Rachel/Domi/Antoni/Arnold) — must be Janet/Jessica/George/Daniel/Sarah/Adam.
- [ ] Migration script run twice → idempotent (second run reports `0 projects updated`).
- [ ] Inverse migration (`scripts/migrate-phase-1.4-inverse.ts --env=staging`) strips new fields and restores structure — verify one project manually.

## 8. Failure modes (graceful)

- [ ] fal API down (disable `FAL_KEY` temporarily) → submit returns error chip; UI does not crash.
- [ ] ElevenLabs API down → TTS job fails with clear error; no UI crash; retry succeeds when key re-enabled.
- [ ] Director called with no tool match → conversational reply; no phantom tool-chip in UI.

## Sign-off

- [ ] All items pass or formally deferred with issue ticket.
- [ ] No tool-chip hallucinations (chat UI chips match jsonb state in DB).
- [ ] No regression in Stage 02 character flow, Stage 03 script flow, or Stage 04 version cycling.
- [ ] Maintainer approved.

## Rollback procedure

If migration causes issues: `pnpm exec tsx scripts/migrate-phase-1.4-inverse.ts --env=staging`.

**Note:** voice IDs are NOT reverted by the inverse migration. The old Rachel/Domi/Antoni/Arnold IDs are dead in ElevenLabs; reverting to them would break TTS. The voice remap is permanent.

If all green → proceed to **apply prod migration + open PR + tag v1.4.0**.
