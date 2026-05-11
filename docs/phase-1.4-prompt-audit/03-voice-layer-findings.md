# Phase 1.4 — Prompt Audit · Voice Layer Findings

_Score the voice / TTS surfaces against `C:\Mango Studio\.claude\skills\character-voice-design\SKILL.md`._

The "voice layer" in Mango is thinner than expected because **there is no authored voice prompt anywhere**. The pipeline only has:

- `VOICE_POOL` — 6 ElevenLabs premade `voice_id`s with `{ gender, tone, supports_ru }` labels (`packages/core/src/media/voices.ts`).
- `resolveVoiceId` — narrator-vs-character resolver, returns one id (`packages/core/src/media/audio-mode.ts`).
- `resolveAudioMode` — Cyrillic-detect → silent_tts vs native_audio router.
- `buildVoicePrompt` — name is misleading: it returns `{ voice_id, text, fallback }`, not a voice description. The "prompt" is just the dialogue text itself; voice character is supplied entirely by `voice_id`.
- Script-author prompt (`prompts.ts` lines 78–84) — Grok sees the 6-line pool as RU labels.

The model route is `fal-ai/elevenlabs/tts/multilingual-v2` for every call. No tiering, no v3 path, no per-character settings, no reference clips, no voice bible — until 2026-05-12 when this audit created `C:\mango-studio\voices.md`.

Findings begin at **F29** (F1–F28 are in `02-director-layer-findings.md`).

---

## A. Pool verification

### F29 — Pool ids never verified, MCP returns anomalous payloads (Severity 1, critical)

**What.** `voices.ts` ships 6 hand-curated `voice_id`s. The file's own comment (line 9–13) says "Indicative pool ... verify with `GET /v1/voices?category=premade` and a TTS sandbox test on a Russian sample before swapping ids." This verification was never done in Phase 1.3 / 1.3.5 / 1.3.5-post-polish. During this audit (2026-05-12), `mcp__elevenlabs__get_voice` produced these anomalies:

| id (Mango label) | MCP returned `id` field | MCP returned `name` |
|---|---|---|
| `21m00Tcm4TlvDq8ikWAM` (Rachel) | `eLDc7xhWxG2FElT3kUTj` | "Janet" (professional) |
| `pNInz6obpgDQGcFmaJgB` (Adam) | `pNInz6obpgDQGcFmaJgB` | "Adam - Dominant, Firm" (premade) |
| `AZnzlk1XvdvUeBnXmlld` (Domi) | `WQP7cQUF5aAS6Axh5yaa` | "Elara - Crisp Pro Narrator" (professional) |
| `EXAVITQu4vr4xnSDxMaL` (Bella) | `EXAVITQu4vr4xnSDxMaL` | "Sarah - Mature, Reassuring, Confident" (premade) |
| `ErXwobaYiN019PkySvjV` (Antoni) | `pNInz6obpgDQGcFmaJgB` | "Adam - Dominant, Firm" (premade) |
| `VR6AewLTigWG4xSOukaG` (Arnold) | `pNInz6obpgDQGcFmaJgB` | "Adam - Dominant, Firm" (premade) |

A bogus id (`ZZZ_DOES_NOT_EXIST_ZZZ`) returned a clean 404, so the MCP is not blanket-aliasing — these specific responses come from somewhere. The MCP API key is on a free plan and cannot generate TTS (returns `paid_plan_required`); the MCP `check_subscription` endpoint also failed with missing `user_read` permission. So this MCP cannot serve as authoritative verification, BUT the response anomalies (especially two distinct ids returning byte-identical Adam bodies) are alarming enough to demand direct production-API verification.

**Why it matters.** If Antoni and Arnold's ids both resolve to Adam in production, every Mango project that casts a "warm male" character (Antoni) and a "serious male" character (Arnold) is rendering them with the **same voice** on the audio track. The script-author prompt (lines 82–83 of `prompts.ts`) explicitly tells Grok "avoid duplicate voice_ids" — but Grok thinks Antoni and Arnold are different. The duplicate is invisible to Grok and to the user until the master_clip plays.

**Recommended fix.**

1. Before the next ship, run `curl https://api.elevenlabs.io/v1/voices?category=premade` with the production fal-route API key. Reconcile every id in `VOICE_POOL` against the live catalog. Document the `name`, `labels`, and `preview_url` for each in `voices.md`.
2. For any id that no longer exists or has been rebranded, pick a replacement from the current premade catalog with documented gender / accent / tone match.
3. Add a CI / startup-health check: on web app boot, hit `/v1/voices/:id` for every pool member; fail the build if any 404. This catches catalog drift before users do.

---

### F30 — No per-character `voice_settings` ever pinned (Severity 2, important)

**What.** Every TTS call routes through `fal-ai/elevenlabs/tts/multilingual-v2` with no `voice_settings` override. The fal route accordingly inherits ElevenLabs server-side defaults: `stability: 0.5`, `similarity_boost: 0.75`, `style: 0`, `use_speaker_boost: true`, `speed: 1.0`. The skill (`§3b`) explicitly calls this out as Antipattern #6: "One stability value across all characters. A whispering shy character and a shouting villain do not share a stability setting."

**Why it matters.**

- A narrator voice wants `stability ≥ 0.55` (Robust-ish) so takes don't flicker. Today: 0.5.
- An emotional protagonist wants `stability ≤ 0.4` so dialogue swings work. Today: 0.5.
- Character whose signature is fast tempo wants `speed: 1.1`. Today: 1.0 for every voice.

Take-to-take audio drift on the narrator across a 10-scene master_clip is the most visible symptom — viewers notice that narration "doesn't sound the same" between scene 3 and scene 7 even though it's the same `voice_id`.

**Recommended fix.**

1. Extend the `Character.voice` schema (`packages/core/src/llm/types.ts`) from `{ tts_voice_id }` to `{ tts_voice_id, stability?, similarity_boost?, style?, speed? }`.
2. Extend `narrator_voice` similarly.
3. Surface settings on the fal call (the fal TTS API accepts a `voice_settings` payload per their multilingual-v2 docs).
4. Default settings per character: protagonist → `stability: 0.45`; antagonist → `stability: 0.55`; narrator → `stability: 0.6`. Tune from there.

---

## B. Model route & capability

### F31 — Hardcoded multilingual-v2 route disables every v3 audio tag (Severity 2, important)

**What.** All TTS calls use `fal-ai/elevenlabs/tts/multilingual-v2`. The skill (§2) lists ~30 v3 audio tags (`[whispers]`, `[laughs]`, `[shouts]`, `[mischievously]`, `[strong French accent]`, etc.) that turn the TTS surface from "read this text" into "perform this text". v3 tags are silently ignored by v2 — if a script author ever wrote `[whispers] секрет` it would render literally as the text "[whispers] секрет" with no whisper effect.

`character-voice-design` §2 also notes Antipattern #2: "Using v3 tags with a v2 voice. `[whispers]` becomes literal text in the audio."

A grep for `[whispers]`, `[laughs]`, `[sighs]`, `[shouts]`, `[excited]`, `[sad]` across `packages/core/` shows **zero** tag insertions in the prompt layer or in any sample dialogue — so nobody has tried yet. But the moment Grok learns about audio tags (which it will, the next time the script-author prompt mentions them) the bug is one prompt-update away.

**Why it matters.** Emotional range is the #1 reason cartoon voices feel alive. Cutting off v3 tags means every line is read in the voice's natural delivery — Rachel (narrator) reads frightened dialogue the same as cheerful dialogue. Stability+style alone cannot replace tags per the skill (§3b).

**Recommended fix.**

1. Add a tier-aware route: economy stays on `multilingual-v2` (cheap, no tags); premium routes to `eleven_v3` where fal supports it (check fal model registry — there should be a `fal-ai/elevenlabs/tts/v3` or equivalent at audit time).
2. If fal doesn't yet wrap v3, document this as a Phase 1.5 blocker and either (a) call the ElevenLabs API directly for premium projects, or (b) wait for fal coverage.
3. When v3 is online, update the script-author prompt to allow tag insertion in dialogue with a short tag palette. Also pre-validate per voice (skill §2 "Tag rules" — not every voice can do every tag).

---

### F32 — Russian dialogue forces silent_tts, wasting Veo 3.1 native audio (Severity 3, hygiene — deliberate tradeoff)

**What.** `resolveAudioMode` (`audio-mode.ts` line 26–29) auto-detects Cyrillic in dialogue text and returns `silent_tts` — meaning the video model renders silent video and ElevenLabs adds dub on top via mux. This is correct for Seedance Lite / 2.0 (English-trained audio) and Kling (no native audio), but it also forces silent_tts for **Veo 3.1**, which has native audio. Veo's native audio is approximate (English-biased and lip-sync is imperfect) so the silent_tts route is the better quality bar — but the tradeoff isn't documented anywhere.

**Why it matters.** Premium projects on Russian scripts never see Veo's native-audio capability. If a Russian-language project with English-name characters slipped a Cyrillic-free dialogue line through, Veo would render with native audio for that one scene and ElevenLabs dub for every other scene — audio quality would jump-cut between scenes.

**Recommended fix.**

1. Add a comment to `audio-mode.ts` documenting the deliberate Cyrillic → silent_tts decision and why.
2. Add a per-project `force_audio_mode: 'native' | 'silent_tts' | 'auto'` setting so future premium-Russian projects can opt into Veo native audio if user explicitly accepts the quality risk.
3. Document this tradeoff in CLAUDE.md "Two-mode system" entry.

---

## C. Voice prompt authoring

### F33 — `buildVoicePrompt` is a resolver, not a prompt author (Severity 1, critical for voice-design ambitions)

**What.** `buildVoicePrompt` in `video-prompts.ts` lines 124–141 returns `{ voice_id, text, fallback }`. The "prompt" sent to ElevenLabs is just `text` — the literal dialogue line. There is no `voice_description` (the 7-axis prompt the `character-voice-design` skill §1 calls "mandatory"). The voice character is supplied entirely by the `voice_id` lookup; we are renting premade voices instead of designing them.

This is fine for v2-era multilingual-v2 (the model doesn't accept voice descriptions on TTS anyway — voice descriptions are for `/v1/text-to-voice/design`). But it means:

- Mango has no per-character voice authored anywhere. The closest thing is the one-word `tone` in `voices.ts`.
- `Character.voice.description` field exists in the type (`video-prompts.ts` line 13 — `voice?: { tts_voice_id?: string; description?: string }`) but is never written and never read.
- If we ever move to ElevenLabs Voice Design (custom voice per character, where you author a 7-axis prompt and lock a generated `voice_id`), the entire authoring surface needs to be built from scratch.

**Why it matters.** Renting 6 premade voices caps the voice diversity at 6. A Mango short with 5 characters that need distinct vocal identities will either reuse voices (continuity bug — same voice on two characters) or starve the cast. Custom voice design lifts the cap and gives every character a vocal fingerprint that matches the visual design.

**Recommended fix.** Treat this as a Phase 1.5+ feature, not a 1.4 fix. When designing:

1. Add a `voice_design_prompt` field to Character schema, populated by the script-author with a 7-axis description (per skill §1 template).
2. On character creation, call `POST /v1/text-to-voice/design` with seed + voice_description.
3. Pick a preview, call Create-Voice to lock a permanent `voice_id`.
4. Persist `voice_id` + `voice_design_prompt` + `voice_settings` + reference-clip URL on the Character row.
5. Update `voices.md` with the new permanent voice.

---

### F34 — No reference clip exists for any voice in the pool (Severity 2, important)

**What.** Skill §3d / §6: every voice needs a reference clip on disk so future agents can hear what the voice sounds like before deciding to use it for a character. Mango has none. This audit attempted to generate 6 × 80-char Russian clips via `mcp__elevenlabs__text_to_speech`; the call failed with `paid_plan_required` because the MCP's API key is on a free plan that cannot use library voices via API.

**Why it matters.** Without a reference, every new agent (Phase 1.4 cinematography pass included, every Director Agent regeneration, every human re-onboarding) re-imagines what "Bella — soft female" sounds like. The user's mental model is the only ground truth, and it's lossy across sessions.

**Recommended fix.**

1. On the production fal route, generate one ~6s Russian clip per voice using the audit sample text:
   > "Я думал, мы договорились! Но если ты так хочешь — пусть будет по-твоему. Хорошо."
2. Save under `assets/voices/<label>_ref.mp3` and check into git (~50–100kB per file at 64kbps mono — negligible).
3. Link each clip from the corresponding `voices.md` section.
4. Add a "regenerate reference clips" CI job that runs quarterly and diffs new clips against on-disk clips — catches the F29 catalog-drift bug from the audio side.

---

## D. Voice → script-author integration

### F35 — Narrator hardcoded to Rachel; no project-level narrator persona (Severity 3, hygiene; tied to F7)

**What.** `prompts.ts` line 76 instructs Grok: *"narrator_voice.tts_voice_id — ElevenLabs voice_id; если не уверен — используй placeholder '21m00Tcm4TlvDq8ikWAM' (Rachel, multilingual)."* `audio-mode.ts` line 68 also falls back to `VOICE_POOL[0]!.id` = Rachel for any unspecified narrator. There is no way to author the project narrator as a persona ("calm fatherly narrator for a children's story" vs "noir-deadpan baritone for a thriller").

Cross-reference: F7 in `02-director-layer-findings.md` already flagged this from the director side. From the voice side, the issue is that the narrator's role in the storyboard is structurally different from a character's role (omniscient, always-on, never on-screen) and deserves its own 7-axis description distinct from the pool's "neutral fallback" pattern.

**Why it matters.** Every Mango short with no explicit narrator request sounds like the same Rachel-narrated piece. Brand-wise, this is closer to Russian-podcast generic than to a per-project cinematographic choice. The narrator is doing the heaviest lifting on tone — and we treat it like a fallback.

**Recommended fix.** Tie to F33. Add `Project.narrator_persona: { description (7-axis), voice_id, voice_settings }` and let the script author propose it from the user brief (genre + duration + audience). Hold the voice_id in `voices.md` once locked.

---

### F36 — No tool exists to change a character's voice_id post-assignment (Severity 2, important; tied to F21)

**What.** F21 in `02-director-layer-findings.md` already flagged this from the Director Agent side. The voice-side framing: once Grok assigns Antoni → Космокот, the only way to swap that to Arnold is to manually edit the Character row in the database. There is no `set_character_voice` chat-tool. CLAUDE.md and the skill (§3a) say "`voice_id` once committed is permanent" — but the skill's §3a refers to **permanent after voice design**, not "permanent before any audio has been rendered". For pre-audio assignments, swap should be safe.

**Why it matters.** A user who says "Космокот звучит слишком мягко, попробуй пожёстче" cannot get what they want through chat; they have to dive into raw character editing or rebuild the project. Friction → drop-off.

**Recommended fix.** Implement `set_character_voice(character_id, voice_id)` tool with these rules:

- Refuse if any `scene.voice_audio_versions[].active === true` exists for any scene that references this character (would orphan rendered audio).
- Refuse if `master_clip_versions` is non-empty (master is glue + audio; new voice would mismatch).
- Otherwise update `Character.voice.tts_voice_id`, clear `voice_audio_versions` for affected scenes, mark next regen as cost-priced.
- Update `voices.md` "Last reviewed" timestamp on the character entry (if we ever go to per-character entries — see F33).

---

## E. Voice continuity surface

### F37 — No "voice canary" check between regenerations (Severity 3, hygiene)

**What.** When Grok re-generates a script (`refine_script` tool, see `02-director-layer-findings.md` F24), it produces a fresh `characters` array. The diff/merge logic (`packages/core/src/llm/character-diff-merge.ts`) preserves character ids for `keep` actions, but there is no assertion that `keep`-preserved characters retain their `voice_id`. If Grok forgets to echo the voice fields on a `keep` action, the character ends up with `voice_id: null` and the resolver silently falls back to Rachel.

**Why it matters.** A 4-scene project might have character "Космокот" with `voice_id: VR6AewLTigWG4xSOukaG` (Arnold). User asks "сделай сюжет чуть мрачнее". Grok's `refine_script` re-emits `{ action: 'keep', id: 'c1' }` for Космокот, **without echoing voice_id**. The diff/merge code keeps the old voice. But there's no test, no assertion — if a future refactor or a different LLM prompts differently, the voice silently disappears.

**Recommended fix.**

1. In `character-diff-merge.ts`, assert that any `keep` action's output character has a non-null `voice_id`. If null, copy from the previous version (don't fail — just preserve).
2. Add a unit test: take a project with 3 characters with distinct voices; run a synthetic `refine_script` that drops voice_id on one keep; assert the merged output has all 3 voices intact.

---

### F38 — `description` field on `Character.voice` is dead code (Severity 4, hygiene)

**What.** `video-prompts.ts` line 13 types `voice` as `{ tts_voice_id?: string; description?: string }`. The `description` field is **never written** by Grok (the script-author prompt doesn't ask for it), **never read** by `buildVoicePrompt` (the resolver only looks at `tts_voice_id`), **never surfaced** in the UI. It exists in the type only.

**Why it matters.** Dead fields invite confusion. A future agent reads the type, thinks voice description is wired up, writes code that depends on it, and discovers at runtime that it's always undefined.

**Recommended fix.** Either (a) wire it up to F33 (7-axis description, used by Voice Design API), or (b) drop the field from the schema.

---

## Audit checklist (skill §6) — Mango score 2026-05-12

Across all 6 voices in the pool:

| Skill requirement | Status |
|---|---|
| Voice description covers all 7 axes | ✘ for 6/6 (no axes authored) |
| `voice_id` persisted & referenced (not regenerated) | ✔ — code references stable ids |
| `voice_settings` pinned per-character | ✘ for 6/6 (ElevenLabs server defaults silently) |
| `voices.md` exists & up to date | **✔ as of 2026-05-12** (this audit created it; previously: missing) |
| v3 tags only used with v3 model | n/a — no tags used yet (multilingual-v2 route) |
| Tag palette validated per voice | n/a until v3 route lands |
| Reference clip exists for every character | ✘ for 6/6 (free-plan MCP cannot generate; production must do it) |

**Pre-audit score: 1/7. Post-audit (voices.md created): 2/7.**

---

## Sub-totals

| Surface | Findings | Severity |
|---|---|---|
| Pool verification | F29 | **1× Severity-1 critical** (pool ids never verified; MCP anomalies; Antoni / Arnold may both alias to Adam) |
| Voice settings | F30 | important — all voices on ElevenLabs defaults |
| Model route | F31, F32 | F31 important (v3 tags blocked), F32 hygiene (deliberate tradeoff to document) |
| Voice prompt authoring | F33, F34 | F33 critical for voice-design future, F34 important (no reference clips) |
| Script-author integration | F35, F36 | both important; cross-referenced with F7, F21 |
| Continuity surface | F37, F38 | F37 important (silent fallback risk), F38 hygiene (dead field) |

**Total: 10 findings (F29–F38), of which 2 are critical (F29 pool verification, F33 voice-prompt authoring surface) and 5 important (F30, F31, F34, F35, F36, F37).**

Cross-references back to director-layer findings:

- F35 ↔ F7 (narrator voice as project persona)
- F36 ↔ F21 (set_character_voice tool — same gap, two layers)
- F37 ↔ F24 (refine_script must preserve voice fields, same way it must preserve visual theme)

The cinematography-layer pass (running in parallel) will add findings starting at F39 onward.
