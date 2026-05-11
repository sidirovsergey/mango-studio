# Mango Studio — Voice Bible (voices.md)

**Purpose.** Single source of truth for every TTS voice used in the Mango Studio pipeline. Whenever a character is bound to a `voice_id`, that binding is permanent — re-designing or silently swapping a voice mid-project breaks audio continuity across already-rendered scenes. This file is the canonical record so a future agent (human or LLM) does not silently re-design a voice they cannot tell apart by ear.

**Authoritative skill.** `C:\Mango Studio\.claude\skills\character-voice-design\SKILL.md` (sections §1 seven-axis description, §3 cross-scene consistency, §6 audit checklist).

**Where these voices live in code.**

- `C:\mango-studio\packages\core\src\media\voices.ts` — `VOICE_POOL` array (6 entries, all premade premade).
- `C:\mango-studio\packages\core\src\media\audio-mode.ts` — voice resolution (narrator → `tts_voice_id`; character → `character.voice_id`; fallback → `VOICE_POOL[0]`).
- `C:\mango-studio\packages\core\src\media\video-prompts.ts` — `buildVoicePrompt` (resolver only, no actual voice prompt text).
- `C:\mango-studio\packages\core\src\llm\prompts.ts` lines 78–84 — Grok script-author sees the pool as RU labels with gender + tone only.

**Production route.** All Mango TTS goes through `fal-ai/elevenlabs/tts/multilingual-v2`, which uses the `eleven_multilingual_v2` model. **v3 audio tags (`[whispers]`, `[laughs]`, etc.) are NOT supported on this route.** Russian dialogue is supported by `eleven_multilingual_v2`.

**Pool verification status (2026-05-12).** The pool was added in Phase 1.3 with a comment in `voices.ts` line 9–13 reading "Indicative pool ... verify with `GET /v1/voices?category=premade` and a TTS sandbox test on a Russian sample before swapping ids." That verification **was never done**. During this audit pass, the ElevenLabs MCP attached to this project (free plan, missing `user_read` and `voices_library` permissions) **could not authoritatively confirm the pool** — the `get_voice` endpoint returned anomalous payloads where the response `id` field did not echo the queried id (e.g., querying `21m00Tcm4TlvDq8ikWAM` returned a body with `id: eLDc7xhWxG2FElT3kUTj`, name `Janet`). This is either MCP-server response caching, ElevenLabs silent alias-on-404, or the voice ids in the pool have drifted from the public catalog. **Severity-1: requires direct verification via the production-grade API key before the next ship.** See `docs/phase-1.4-prompt-audit/03-voice-layer-findings.md` F29.

**Customization status across the pool.** None. Every voice runs at ElevenLabs defaults (`stability: 0.5`, `similarity_boost: 0.75`, `style: 0`, `use_speaker_boost: true`, `speed: 1.0`). No per-character override has ever been pinned. No reference clip has been recorded.

---

## Rachel — `21m00Tcm4TlvDq8ikWAM`

**Role in Mango pool.** Default narrator voice. Default fallback when `narrator_voice.tts_voice_id` is missing (`audio-mode.ts` line 68; `prompts.ts` line 76 also hardcodes this id as the placeholder). Grok is instructed to use this id for "only one speaking character, no special requirement" projects (`prompts.ts` line 84).
**ElevenLabs label in `voices.ts`.** "Rachel" — female, "нейтральный".
**Verified against ElevenLabs catalog 2026-05-12.** **No.** MCP returned anomalous payload (see preamble).
**Model_id.** `eleven_multilingual_v2` (only model supported by `fal-ai/elevenlabs/tts/multilingual-v2`).
**Russian support.** Confirmed at model level (RU is in `eleven_multilingual_v2` supported languages).

**7-axis description.** Not authored. The skill (§1) makes this mandatory; we have only `gender=female, tone=нейтральный`.

- Physiology: **unspecified** — needs authoring before next ship
- Accent / Language: **unspecified** (likely General American per common premade-Rachel knowledge, but unverified for the id in our pool)
- Timbre: **unspecified**
- Tempo / Rhythm: **unspecified**
- Pitch / Range: **unspecified**
- Emotional baseline: **unspecified**
- Speech patterns: **unspecified**

**voice_settings (current effective values).**

- stability: 0.5 (default — not customized for Mango)
- similarity_boost: 0.75 (default — not customized)
- style: 0 (default)
- use_speaker_boost: true (default)
- speed: 1.0 (default)

**Recommended Mango customization.** **TBD — pending Phase 1.4 voice-design pass.** Narrator typically wants stability ≥ 0.55 (per skill §3b: "Robust" or high-numeric value for hosts/narrators) to avoid take-to-take flicker.

**v3 audio tags compatibility.** Not usable on current route (multilingual-v2 ignores v3 tags per skill §2 "tag rules"). To unlock, route would need to switch the fal model to one wrapping `eleven_v3`. See finding F31.

**Tag palette (when v3 lands).** Not validated.

**Reference clip.** **Not generated.** Audit attempt 2026-05-12 failed: API key on free plan returned `paid_plan_required`. To generate, use production fal.ai key with sample text:

> "Я думал, мы договорились! Но если ты так хочешь — пусть будет по-твоему. Хорошо."

Output: `assets/voices/rachel_ref.mp3`.

**Last reviewed.** 2026-05-12 (audit pass — bindings unchanged, gaps documented).

---

## Adam — `pNInz6obpgDQGcFmaJgB`

**Role in Mango pool.** Male neutral fallback. Grok assigns it via the "different speakers get different voice_ids" rule (`prompts.ts` line 83). No project-level role yet.
**ElevenLabs label in `voices.ts`.** "Adam" — male, "нейтральный".
**Verified against ElevenLabs catalog 2026-05-12.** **Partial.** MCP `get_voice` for this id returned `name: "Adam - Dominant, Firm"`, `category: premade`. The label suggests this is **NOT a neutral voice** — it's marketed as "Dominant, Firm". The Mango `tone: 'нейтральный'` label is **misleading to Grok during voice assignment**.
**Model_id.** `eleven_multilingual_v2`.
**Russian support.** Confirmed at model level.

**7-axis description.** Not authored.

- Physiology: **unspecified** (likely adult male per ElevenLabs naming convention)
- Accent / Language: **unspecified** (likely General American, unverified)
- Timbre: **unspecified** — note ElevenLabs marketing label "Dominant, Firm" implies low-resonance, controlled
- Tempo / Rhythm: **unspecified**
- Pitch / Range: **unspecified** — "Dominant" suggests low register
- Emotional baseline: **unspecified** — "Firm" suggests assertive/grounded
- Speech patterns: **unspecified**

**voice_settings (current).** Defaults across the board (see Rachel).

**Recommended Mango customization.** TBD. If the "Dominant, Firm" label is accurate, this voice fits antagonists / authority figures and **should not be used as a neutral fallback** — Grok needs to be told this so a children's story protagonist doesn't end up with a villain timbre.

**v3 audio tags compatibility.** Not usable.

**Reference clip.** Not generated. See Rachel.

**Last reviewed.** 2026-05-12.

---

## Domi — `AZnzlk1XvdvUeBnXmlld`

**Role in Mango pool.** Young female. Grok-eligible.
**ElevenLabs label in `voices.ts`.** "Domi" — female, "молодой".
**Verified against ElevenLabs catalog 2026-05-12.** **Anomalous.** MCP returned `name: "Elara - Crisp Pro Narrator"`, `category: professional` with `id` field stripped from response body. Either (a) this id no longer exists and the MCP returned a fallback for a different voice, (b) the id has been rebranded "Elara", or (c) MCP cache bug. Cannot determine without production key. **Severity-1: must verify.**
**Model_id.** `eleven_multilingual_v2`.
**Russian support.** Confirmed at model level.

**7-axis description.** Not authored.

- Physiology: **unspecified** ("young" per Mango label, but if the actual voice is "Elara — crisp pro narrator", it's a mature professional narrator and the label is wrong)
- All other axes: **unspecified**

**voice_settings (current).** Defaults.

**Recommended Mango customization.** Hold until verification (F29).

**v3 audio tags compatibility.** Not usable.

**Reference clip.** Not generated.

**Last reviewed.** 2026-05-12 — flagged for verification.

---

## Bella — `EXAVITQu4vr4xnSDxMaL`

**Role in Mango pool.** Soft female.
**ElevenLabs label in `voices.ts`.** "Bella" — female, "мягкий".
**Verified against ElevenLabs catalog 2026-05-12.** **Conflict.** MCP returned `name: "Sarah - Mature, Reassuring, Confident"`, `category: premade`. Either rebrand, mis-mapping, or stale id. The ElevenLabs label "Mature, Reassuring, Confident" matches Mango's "soft" loosely but not "Bella" by name. **Verify.**
**Model_id.** `eleven_multilingual_v2`.
**Russian support.** Confirmed at model level.

**7-axis description.** Not authored.

- Physiology: **unspecified** (if actually Sarah, "Mature" = adult adult)
- Emotional baseline: **unspecified** ("soft" in Mango ≈ "Reassuring, Confident" in ElevenLabs label, but unverified)

**voice_settings (current).** Defaults.

**Recommended Mango customization.** TBD.

**v3 audio tags compatibility.** Not usable.

**Reference clip.** Not generated.

**Last reviewed.** 2026-05-12 — flagged for verification.

---

## Antoni — `ErXwobaYiN019PkySvjV`

**Role in Mango pool.** Warm male.
**ElevenLabs label in `voices.ts`.** "Antoni" — male, "тёплый".
**Verified against ElevenLabs catalog 2026-05-12.** **Critical anomaly.** MCP `get_voice` returned the body for `pNInz6obpgDQGcFmaJgB` (Adam — Dominant, Firm) instead of any "Antoni" payload, with the response `id` field showing `pNInz6obpgDQGcFmaJgB`. This is either: (a) the id is retired and the API returned Adam as a fallback (unlikely — the standalone bogus-id test returned 404 cleanly), (b) MCP-side response caching, (c) the id was originally aliased to Adam internally and the public name was changed. **Production must verify directly.** If Antoni's id resolves to Adam in production, every "warm male voice" Grok assigns to a character is silently rendering as Adam-Dominant-Firm — a continuity / casting bug invisible at the prompt layer.
**Model_id.** `eleven_multilingual_v2`.
**Russian support.** Confirmed at model level.

**7-axis description.** Not authored.

**voice_settings (current).** Defaults.

**Recommended Mango customization.** **Block until verified.** This is the single highest-priority verification target in the pool.

**v3 audio tags compatibility.** Not usable.

**Reference clip.** Not generated.

**Last reviewed.** 2026-05-12 — **flagged Severity-1.**

---

## Arnold — `VR6AewLTigWG4xSOukaG`

**Role in Mango pool.** Serious male.
**ElevenLabs label in `voices.ts`.** "Arnold" — male, "серьёзный".
**Verified against ElevenLabs catalog 2026-05-12.** **Same critical anomaly as Antoni.** MCP `get_voice` for `VR6AewLTigWG4xSOukaG` returned a body with `id: pNInz6obpgDQGcFmaJgB` (Adam — Dominant, Firm). Two distinct Mango voices (Antoni warm, Arnold serious) **may both be silently routing to Adam in production**, which would render Arnold and Antoni interchangeable on the audio track. Confirm via direct production API call.
**Model_id.** `eleven_multilingual_v2`.
**Russian support.** Confirmed at model level.

**7-axis description.** Not authored.

**voice_settings (current).** Defaults.

**Recommended Mango customization.** **Block until verified.**

**v3 audio tags compatibility.** Not usable.

**Reference clip.** Not generated.

**Last reviewed.** 2026-05-12 — **flagged Severity-1.**

---

## Maintenance protocol

1. **Never silently swap a `voice_id`.** Once a character row has `voice_id = X`, that binding is permanent. To replace it, see finding F36 (set_character_voice tool, refused if any voice_audio_versions exist).
2. **Update this file on every voice change.** New voice added → new section. Voice retired → mark `retired_at: <date>`, do NOT delete (history record).
3. **Re-verify pool quarterly.** ElevenLabs has rebranded / retired premade voices in the past. Run `GET /v1/voices?category=premade` via production API key; reconcile against this file.
4. **Pin settings on first character binding.** When the first project commits a character to a voice, also commit `stability`, `similarity_boost`, `style`, `speed` to this file alongside.
5. **Generate a reference clip per voice.** ~80-char Russian sentence that exercises emotional range. Save to `assets/voices/<label>_ref.mp3`.

## Open questions for Phase 1.4

- Does the production fal-route ElevenLabs key resolve these 6 ids to distinct voices, or does it hit the same alias anomaly the MCP saw?
- Should the pool expand beyond 6? (Cartoons typically need: child / teen / young-adult / mature / elderly × 2 genders + 2 narrators = 12 minimum for variety.)
- Should premium projects route to `eleven_v3` for audio-tag support? (Finding F31.)
- Should `narrator_voice` be a project-authored persona (with 7-axis description), not a voice_id picker? (Finding F33, F35.)
