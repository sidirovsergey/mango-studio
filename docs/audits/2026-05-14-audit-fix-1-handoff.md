# Audit handoff — `claude/audit-fix-1` (PR #23)

**For:** Codex (or any reviewer doing an independent pass).
**Author:** Claude (Sonnet 4.5).
**Branch:** `claude/audit-fix-1` against `main`.
**PR:** https://github.com/sidirovsergey/mango-studio/pull/23
**Diff size:** 100 files changed, +2,675 / −8,270 (net −5,595 LOC).
**Status at handoff:** CI green on every commit. User actively testing on the preview alias `https://mango-studio-demo-git-clau-9a7796-sidirovsss-gmailcoms-projects.vercel.app/`.

---

## 1. Why this branch exists

The user was running a live audit of the v1.4.1 deploy on `mangopro.ru` and surfaced multiple cascading problems. He explicitly directed me **not** to formal-brainstorm — just diagnose, fix, ship. Direction quotes (Russian; my translation in brackets where useful):

- *"Слишком сильное дробление на сцены"* → cinematography sub-fragmentation: 60s scripts came back as 10–12 ~5s scenes, but a working pro animator (whose reference prompts the user shared) writes ~10s scenes with internal sub-second beat timing.
- *"Пиздец какой-то, а не нормальная система"* → audio pipeline was breaking lip-sync for Russian dialogue: silent_tts → ElevenLabs TTS → ffmpeg mux produced video where audio didn't match mouth movement. *"Давай просто уберём вообще вот это вот отдельное аудио, пусть используется в системе только модели, которые встроенно генерируют звук"*.
- *"Я не вижу промпт для генерации изображения первого кадра сцены, и я не вижу промпт для генерации видео ... только после генерации я вижу промпт"* → prospective prompts must be visible BEFORE generation.
- *"Это абсолютно разные персонажи, никаких референсов между ними"* → character continuity is broken — dossier and first-frame render visually different characters.
- *"Облегчи, упрости, но сделай эту систему надёжной, как автомат Калашникова"* → "Kalashnikov" principle: fewest moving parts, fewest failure modes.

He also explicitly chose **Grok Imagine Video** as the economy default and accepted dropping Seedance Lite / Kling / LTX from the active model set.

## 2. What landed (11 commits, in order)

| Sha | Commit | One-line summary |
|---|---|---|
| `a68a034` | `fix: prompt audit — cadence 10s/scene + Pixar-grade video prompts` | Rewrote cadence_table (15s→2, 30s→3, 60s→6, 90s→9), regenerated few-shot examples, added `[AESTHETIC]` / `[PERFORMANCE]` / `[MICRO ACTION]` block helpers shared between Seedance 2.0 and Veo 3.1. Also applied Phase 1.4 + 1.4.1 migrations to prod + staging via Supabase MCP. |
| `f95f1e3` | `style: biome format rubric.test.ts` | CI lint fixup. |
| `5c47d4b` | `fix(stage04): two bugs surfaced by live preview testing` | (a) use-poll-jobs race: removeJob fired before setScript so UI flickered "frame not generated" before the new version landed → inverted ordering: fetch script first, removeJob in finally. (b) PromptEditorModal opened empty when no version existed → added `buildProspectivePromptAction` (server, byte-for-byte mirror of generator action's prompt assembly). |
| `4be5658` | `fix(continuity): auto-trigger reference_image when missing on first_frame` | Old characters created before Phase 1.4 migration landed have `dossier.storage` but no `dossier.reference_image` (the CHECK constraint blocked the auto-chain). `generateFirstFrameAction` now detects this gap and auto-triggers `generateReferenceImageAction` for each affected character, returning a friendly "повтори через 30s" error. |
| `1e92870` | `feat(models): swap economy to Grok Imagine Video, premium = Seedance 2.0 + Veo 3.1` | Economy default now `xai/grok-imagine-video/image-to-video` @480p; premium = Seedance 2.0 Pro + Veo 3.1 + Grok @720p. Seedance Lite / Kling Turbo std/Pro / LTX moved to LEGACY-only in `VIDEO_MODEL_LIST` (still parseable for historic scenes, removed from `VIDEO_MODELS.{economy,premium}` so UI selectors don't expose them). `AudioModeControl` removed from `SceneSidePanel`. |
| `4443b4d` | `feat(stage04): show prospective prompts inline in SceneSidePanel` | Added `buildAllProspectivePromptsAction` batch action. `Stage04Provider` holds a `prospectivePrompts: ProspectivePromptMap \| null` field. `usePollJobs` refreshes the batch after every script-tick. `PromptSection` falls back to the prospective prompt (with a `черновик` chip) when no real version exists. |
| `a2528c2` | `refactor(video-prompts): unified builder, delete per-engine files` | Dispatch in `video-prompts/index.ts` collapsed to `buildVideoPrompt = buildSeedance2Prompt` for every model id. Deleted `seedance-lite.ts`, `kling-2.5.ts`, `ltx.ts`, `generic.ts`, `veo-3.1.ts` + their tests + 25 snapshot fixtures. |
| `4d0b342` | `refactor(audio): rip out ElevenLabs TTS chain end-to-end` | Largest commit. Deleted `media/{audio-chain,audio-mode,voices}.{ts,test.ts}`, `actions/{composeSceneFinalClip,generateSceneVoice,retrySceneAudio,setCharacterVoice,setSceneAudioMode}{,.test}.ts`, `audio-chain-helpers.ts`, `AudioPipeline{Error,Spinner}.tsx`. Stripped `narrator_voice` authoring block from script prompt (replaced by explicit "DO NOT emit narrator_voice"). `set_character_voice` Director tool removed. `pollMediaJobsAction` lost `advanceAudioChain` + the 1.4.1 retry path. `confirmPendingActionAction`'s `regen_scene_voice` / `compose_scene_final_clip` cases now return a graceful "audio pipeline retired" chip. `CharacterModalClient` lost the VoicePicker + TTS provider toggle. Schema fields (`audio_mode`, `voice_audio_versions`, `final_clip`, `narrator_voice`) **kept** on the jsonb for back-compat with old projects. |
| `d0514ab` | `refactor(master-clip): drop mux dependence, audio comes from each scene` | `generateMasterClipAction.has_full_audio` now computed from per-scene video model metadata instead of "every scene has a muxed final_clip". Comment fixed to reflect that native audio flows through ffmpeg merge-videos automatically. |
| `e5e17a4` | `fix(continuity): generate reference_image as image-to-image from dossier` | The "different character every scene" symptom had a deeper root: `character_reference_image` was a pure text-to-image roll, independent of the dossier. Three independent rolls of the same description → three different characters. Fix: `GenerateCharacterReferenceImageInput` now accepts `image_refs[]`, `FalMediaProvider.submitCharacterReferenceImage` routes through `getEditModel` (e.g. `nano-banana-2/edit`) when refs present, `generateReferenceImageAction` always passes `character.dossier.storage` as anchor. |
| `9791027` | `fix(script-gen): bump maxDuration to 120s + add client-side timeout escape` | Live preview reported "бесконечная попытка генерации сценария". Vercel default function timeout is 10s on hobby / 60s on pro. Script-gen for 60s premium can hit 60–90s on Grok. Bumped `apps/web/src/app/api/scripts/route.ts` (or wherever — see commit; **VERIFY**) `maxDuration` to 120 and added a client-side `Promise.race` with 150s timeout that surfaces a toast instead of spinning forever. |

## 3. Architecture changes summary

### 3.1 Model registry

**Active** (user-selectable, all carry native audio):

| Tier | Default | Alternatives | fal.ai id |
|---|---|---|---|
| economy | Grok Imagine Video @480p | — | `xai/grok-imagine-video/image-to-video` |
| premium | Seedance 2.0 Pro | Veo 3.1, Grok @720p | `bytedance/seedance-2.0/image-to-video`, `fal-ai/veo3.1/image-to-video`, `xai/grok-imagine-video/image-to-video` |

**Legacy** (in `VIDEO_MODEL_LIST` only, NOT in `VIDEO_MODELS.{economy,premium}`):
- `fal-ai/bytedance/seedance/v1/lite/image-to-video`
- `fal-ai/kling-video/v2.5-turbo/standard/image-to-video`
- `fal-ai/kling-video/v2.5-turbo/pro/image-to-video`
- `fal-ai/ltx-video`

Old scenes that already store one of these model ids in `scene.config_overrides.model` still get cost-hint + label via `getVideoModelMeta()`. They can't be picked for new scenes.

### 3.2 Audio pipeline (deleted in full)

**Before:**
```
text → script-author emits dialogue + narrator_voice
     → video model: silent (silent_tts mode for Cyrillic)
     → ElevenLabs TTS: voice clip
     → ffmpeg-api/merge-audio-video: muxed final_clip
     → master_clip: ffmpeg concat over final_clip URLs
```

**After:**
```
text → script-author emits dialogue (no narrator_voice)
     → video model: video WITH native audio + lipsync
     → master_clip: ffmpeg concat over raw video URLs
```

All TTS code paths, retry-on-error backoff, audio-chain orchestration, voice-pool registry, set_character_voice tool, audio_mode resolver are gone. Schema fields stay (`audio_mode`, `voice_audio_versions`, `final_clip`, `narrator_voice`) so old projects on the jsonb still parse — they're inert.

Master clip simplification: `has_full_audio` flag now derived from `getVideoModelMeta(scene.video_versions[active].model)?.has_native_audio` (with `scene.final_clip` as legacy override).

### 3.3 Video prompt builder

Six per-engine builders (`seedance-2`, `seedance-lite`, `kling-2.5`, `ltx`, `veo-3.1`, `generic`) collapsed into one. `buildVideoPrompt(input) = buildSeedance2Prompt(input)` for every model id. Block grammar (10 sections):
```
[AESTHETIC]   → Vertical 9:16 + tier-aware luxury header from visual_theme
[SCENE]       → lighting recipe + time_of_day + key_direction
[SUBJECT]     → characters_in_scene + @Image1 reference
[ACTION]      → description_en, time-segmented for ≥6s scenes (0–3s/3–7s/7–10s for 10s)
[CAMERA]      → CAMERA_VERB + speed + lens + shot/angle labels
[AUDIO]       → music + ambient + sfx + Dialogue line (native mode)
[PERFORMANCE] → sub-second lipsync timing + Speech rule for Cyrillic (only when dialogue present)
[MICRO ACTION]→ arc-aware face/body acting
[Pacing/Style]→ film_look
Avoid:        → visual_theme.avoid or DEFAULT_AVOID
```

### 3.4 Prospective prompts

The user wanted to see the prompt **before** generation. Path:

1. `buildAllProspectivePromptsAction({ project_id })` on the server walks the script, computes per-scene `{ first_frame: { prompt, model }, video: { prompt, model } }`, returns `ProspectivePromptMap`.
2. Pure-function helpers (`buildFirstFrameForScene`, `buildVideoForScene`) extracted so single-scene action (`buildProspectivePromptAction`) and batch action share the same logic byte-for-byte with the real generator.
3. `Stage04Provider` holds `prospectivePrompts` state with a `setProspectivePrompts` mutator.
4. `usePollJobs.refreshProspective()` re-fetches the batch on initial mount + every 5s tick + every realtime terminal event.
5. `SceneSidePanel.PromptSection` reads `prospectivePrompts[scene_id]` and surfaces it as the prompt when no real active version exists; chip switches between `v1/3` (real version) and `черновик` (prospective).
6. `PromptEditorModal` still has its own single-scene fetch on open for back-compat — could be deleted now (see Known Issues).

### 3.5 Character continuity

The bug: `character_dossier` (multi-pose model sheet, 16:9), `character_avatar` (portrait, 1:1), `character_reference_image` (single-pose, 1:1) were all **independent text-to-image rolls**. Three lottery tickets from the same prompt → three different-looking characters.

The fix (commit `e5e17a4`) makes the **`character_reference_image` step** image-to-image from `dossier.storage`. Dossier remains text-to-image (canonical), avatar still text-to-image (unfixed in this branch — see Known Issues), reference_image now visually anchored to dossier.

Downstream `buildFirstFramePrompt` already prefers `dossier.reference_image` over `dossier.storage`, so first_frame inherits the anchored visual.

### 3.6 Other UX fixes

- **Poll-loop race** (commit `5c47d4b`): `usePollJobs` realtime handler used to `removeJob(id)` synchronously before async `tick()` could call `setScript()`. UI flickered "frame not generated" during the ~1s gap. Now: fetch script + setScript first, `removeJob` in `finally`.
- **Character continuity auto-backfill** (commit `4be5658`): If first_frame is requested and any character has `dossier` but no `reference_image`, kick off reference_image generation and return a retry message.
- **Script-gen timeout** (commit `9791027`): `maxDuration: 120` on the server route + 150s `Promise.race` on the client to surface a toast instead of spinning forever.

## 4. Files to look at first (highest audit signal-to-noise)

| Priority | File | Why |
|---|---|---|
| 🔴 HIGH | `packages/core/src/llm/examples/script-author.ts` | **Few-shot examples STILL contain `narrator_voice` blocks** even though the prompt now explicitly says "DO NOT emit narrator_voice". Need to either strip narrator_voice from these fixtures OR loosen the prompt rule. Inconsistency between the prompt instruction and the few-shot demonstrations will confuse Grok. |
| 🔴 HIGH | `apps/web/src/server/actions/generateReferenceImageAction.ts` | The image-to-image fix only kicks in when `character.dossier.storage` exists. Verify the dispatch order — is dossier guaranteed to be written before the auto-chain triggers reference_image generation? (Look at the `chainReferenceImageFor` flow in `pollMediaJobsAction.finalizeCompleted`.) |
| 🔴 HIGH | `packages/core/src/media/FalMediaProvider.ts` | `submitCharacterReferenceImage` now routes through `getEditModel(model)` when refs present. `getEditModel('fal-ai/nano-banana-2')` returns `fal-ai/nano-banana-2/edit` — verify this endpoint is correct for image-to-image with 1:1 output. Cost fallback for the edit variant exists in `MODEL_COST_FALLBACK_USD`. |
| 🟠 MED | `apps/web/src/server/actions/pollMediaJobsAction.ts` | `advanceAudioChain` + retry logic deleted. Verify the `voice` / `final_clip` finalize-completed branches still execute cleanly for legacy in-flight rows during rollover. The `void projectTier` comment is a "kept for closure" hack — confirm it's not silently masking a real reference. |
| 🟠 MED | `apps/web/src/components/workspace/stages/scenes/Stage04Provider.tsx` | I left the original `useState(initialScript)` snapshot-once pattern in place because `usePollJobs.setScript` keeps it fresh. But it's worth verifying: is there any path where the provider re-mounts (e.g., navigation) and reads stale `initialScript` from props before the first tick runs? |
| 🟠 MED | `apps/web/src/server/actions/buildProspectivePromptAction.ts` | Single-scene action still kept alongside the batch action. `PromptEditorModal` uses the single-scene variant on open even though `Stage04Provider.prospectivePrompts` already has the answer. Could be deleted — verify nothing else references it. |
| 🟠 MED | `apps/web/src/server/actions/confirmPendingActionAction.ts` | The `regen_scene_voice` / `compose_scene_final_clip` cases now return `{ ok: true }` chip stubs instead of doing work. Verify this doesn't break the `_exhaustive: never` discriminated-union check at the bottom of the switch. |
| 🟠 MED | `packages/core/src/llm/director-state-summary.ts` | `resolveVoiceLabel` collapsed to "native" / "unset" — verify the Director Agent prompt doesn't have a behavioral rule that depends on the old voice-pool labels. |
| 🟡 LOW | `apps/web/src/components/workspace/character/CharacterModalClient.tsx` | VoicePicker + TTS-toggle deleted. `character.voice.tts_provider` field is now never written but might still be read by old code paths. Grep for `tts_provider` to be sure. |
| 🟡 LOW | `packages/core/src/media/video-prompts/_seedance-shared.ts` | File rename should follow: it now hosts engine-agnostic helpers, not just Seedance-shared ones. Filename is historical. Not blocking. |

## 5. Known issues / open questions

### 🔴 Critical (audit must verify)

1. **`narrator_voice` inconsistency** (`script-author.ts`):
   - Prompt instruction (`prompts.ts:166`): `"DO NOT emit a top-level "narrator_voice" object"`.
   - Few-shot examples (`script-author.ts:28–36, 169+`): both fixtures **include** `narrator_voice` with full 7-axis persona.
   - **Risk:** Grok may follow the example over the instruction → output still contains narrator_voice → ScriptGenSchema (which makes it optional) parses fine → field gets persisted on the jsonb → no downstream consumer → silently ignored. Likely benign for now but contradicts the design.
   - **Fix:** strip `narrator_voice` from both fixtures. Update `script-author.test.ts` accordingly.

2. **Character avatar NOT fixed** (`generateCharacterDossierAction.ts`):
   - Dossier (multi-pose) + avatar (1:1 portrait) still launch in parallel as **two independent text-to-image rolls**.
   - Avatar still visually mismatches dossier.
   - My commit `e5e17a4` only fixed `reference_image` (the visual anchor for scenes), not the avatar shown on character cards.
   - **Fix:** either make avatar a chained job after dossier lands, or accept the visual drift for the card thumbnail.

3. **`maxDuration` location verification** (commit `9791027`):
   - I claimed I bumped `maxDuration` for script-gen but I didn't double-check after the user reported the infinite spinner. The actual file/route might be different from what I touched. Verify the script-gen API route has `export const maxDuration = 120;` (Next.js route segment config).

### 🟠 Medium (consider as follow-ups)

4. **Existing characters with old reference_image**:
   - For projects where the user already triggered reference_image under the old text-only path, the fix in `e5e17a4` doesn't help — they still have visually-mismatched references on disk.
   - Recovery path today = delete + recreate character. No UI button to "regen reference" without dropping the whole character.

5. **Dossier UX feedback gap**:
   - User reported: clicked "сгенерировать досье", button showed generating, then looked like it failed silently, closed modal, reopened — dossier was there.
   - Suggests the `CharacterModal` doesn't have the same race fix as `Stage04Inline.usePollJobs`. Realtime fires "completed" before the modal's setState catches up.

6. **`master_clip.has_full_audio` for legacy scenes**:
   - New `has_full_audio` computation requires either `scene.final_clip` (old) OR `getVideoModelMeta(scene.video_versions[active].model)?.has_native_audio === true`. If a legacy scene's active video version was rendered with `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` (which has `has_native_audio: false` in the LEGACY metadata block), `has_full_audio` will return `false`. This is correct but the Stage 05 badge may flag old master clips as "silent" even when they sounded fine before.

7. **`Stage04Provider` prop-sync**:
   - `useState(initialScript)` snapshots on mount. `usePollJobs.tick()` calls `setScript(fresh)` to keep it fresh. But if the user navigates away from a project and back, the provider remounts with a fresh `initialScript`. No race here yet, but the asymmetry is brittle.

8. **`scene.final_clip` "stale" detection in `director-state-summary.ts`**:
   - `isFinalClipStale` still references `scene.voice_audio_active_version_id` to decide whether final_clip is stale relative to a voice rollback. Voice versions don't get created anymore, so this branch is dead code but harmless. Could clean.

9. **`Stage04Provider.SceneView.voice_audio_versions / voice_audio_active_version_id`**:
   - Type kept for back-compat read. UI no longer renders anything from it but the field is in the discriminated union. If we later strict the type, this comes back.

### 🟡 Low (nice-to-haves)

10. **`script-author.test.ts` coverage gap**:
    - I removed/replaced the persona authoring tests but didn't add a positive test verifying the prompt now explicitly tells the LLM NOT to emit `narrator_voice`. There's a `not.toMatch(/<voice_pool>/)` and `toContain('DO NOT emit a top-level')` — but no end-to-end test that feeds a real fixture through the schema and confirms `narrator_voice` is treated as optional.

11. **`buildProspectivePromptAction` redundancy**:
    - Both the single-scene `buildProspectivePromptAction` and the batch `buildAllProspectivePromptsAction` exist. PromptEditorModal calls the single-scene one on open; SceneSidePanel reads from the batch cache. Single-scene action could be dropped if PromptEditorModal reads from `useStage04().prospectivePrompts`.

12. **MODEL_LABEL in SceneSidePanel**:
    - Legacy labels marked `(legacy)`. If those entries are NEVER renderable (because `getActiveVideoModels` excludes them), the legacy entries are dead UI text. They DO render for projects whose `scene.config_overrides.model` is set to a legacy id — verify this scenario isn't broken.

## 6. Test / typecheck / lint status

```
pnpm -r typecheck       → clean
pnpm -r lint            → clean (21 pre-existing warnings in migration.ts about noExplicitAny; 1 in CharacterModalClient about unused vars; none are mine)
pnpm --filter @mango/core test → 543/543 (7 skipped)
pnpm --filter @mango/web  test → 95/95
pnpm --filter @mango/ui   test → 8/8
```

Snapshots regenerated several times during the refactor. The 14 video-engine snapshots for legacy engines were deleted with their builders.

## 7. Test gaps Codex should flag

- No test verifies `buildAllProspectivePromptsAction` returns sensible output for a scene with `audio_mode='silent_tts'` (legacy field on the jsonb). Should resolve to 'native' downstream now.
- No test verifies `submitCharacterReferenceImage` routes through `getEditModel` when `image_refs` provided.
- No test verifies `generateReferenceImageAction` passes `dossier.storage` as ref.
- No test confirms `regen_scene_voice` / `compose_scene_final_clip` pending actions resolve gracefully (no crashes, ok:true chip).
- No test pins the "Russian dialogue → native audio mode → dialogue text appears in [AUDIO] + [PERFORMANCE]" invariant end-to-end through `generateSceneVideoAction`.

## 8. Migration / deployment safety

- **DB migrations:** Phase 1.4 + 1.4.1 migrations were already applied to prod + staging via Supabase MCP earlier in this branch (commit `a68a034` description mentions it). No new migration in this branch.
- **Schema back-compat:** All deleted fields are now ignored, not enforced-absent. Old jsonbs with `narrator_voice`, `audio_mode='silent_tts'`, `voice_audio_versions: [...]`, `final_clip: {...}` still parse via `ScriptGenSchema`.
- **CHECK constraint on `media_jobs.kind`:** Still includes `'voice'` and `'final_clip'` (and `storage_mirror`, etc.). Legacy in-flight rows complete via `pollMediaJobsAction.finalizeCompleted` branches — those branches are kept.
- **Rolling deploy compatibility:** Client + server land at slightly different times during Vercel deploy. Confirm: if old client (with VoicePicker) talks to new server (no `setCharacterVoiceAction`), what's the failure mode? — Old client will get a 404 from the missing route. Toast surfaces it. Not pretty but not corrupting.

## 9. How to run locally

```bash
cd C:/mango-studio/.worktrees/audit-fix-1
pnpm install            # only if first time
pnpm -r typecheck
pnpm -r test
pnpm -r lint
pnpm --filter @mango/web dev   # localhost:3000
```

Env vars come from `.env.local` (not in repo; ask user).

## 10. How user is testing

Preview URL alias: `https://mango-studio-demo-git-clau-9a7796-sidirovsss-gmailcoms-projects.vercel.app/`

This is a Vercel branch alias that always points to the latest deploy of `claude/audit-fix-1`. The user was earlier confused testing on a pinned commit URL — make sure all UX-flow verification uses this alias.

Supabase project for preview: **staging** (`mgsfjyojbidhkxiknhsy`). Schema mirrors prod (both have Phase 1.4 + 1.4.1 migrations applied).

## 11. What I'd most want Codex to second-opinion

In priority order:

1. **Is the `narrator_voice` few-shot leftover a real footgun or noise?** Run a real Grok call (or just read the fixtures carefully) and decide. If it materially confuses Grok, ship a follow-up to strip them from the examples.

2. **Does `getEditModel('fal-ai/nano-banana-2')` actually return a valid endpoint that accepts `image_url` + `aspect_ratio: '1:1'`?** I assumed parity with `submitFirstFrame`'s edit-model path. If the edit endpoint has different param names or output ratios, `submitCharacterReferenceImage` is broken in a way no test catches.

3. **Stage04Provider state model — is the prop-sync gap a real risk?** I argued no because `setScript` from `usePollJobs` keeps state fresh, but I'd take a sanity check.

4. **Any dead exports from `@mango/core`?** Audio rip-out removed VOICE_POOL / resolveAudioMode / planNextChainStep from `core/src/index.ts`. Are there any other now-dead exports that should follow (e.g., `Dossier`, `ReferenceImage`, `MasterClipVersion` types — still used or not)?

5. **`pollMediaJobsAction.finalizeCompleted` legacy `voice` / `final_clip` branches** — do they still write sensibly to `scene.voice_audio_versions` / `scene.final_clip` if a legacy in-flight row completes? I left the code path intact but the rest of the system no longer cares about those fields.

6. **Cost rendering**: `MODEL_COST_FALLBACK_USD` has `'xai/grok-imagine-video/image-to-video': 0.5`. At 480p that's an overestimate (10s = ~$0.50, but 5s = ~$0.25 etc). Should it be tier-aware?

7. **Master clip `has_full_audio` semantic change** — see Known Issue 6 above. Could surface as a Stage 05 UX regression.

If you find anything blocking, post back here as a follow-up commit. If you find something minor, file an issue or note in PR comments. The user is explicitly OK with shipping PR #23 in chunks and iterating.
