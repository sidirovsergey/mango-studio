# Mango Studio — Voice Bible (voices.md)

**Purpose.** Single source of truth for every TTS voice used in the Mango Studio pipeline. Whenever a character is bound to a `voice_id`, that binding is permanent — re-designing or silently swapping a voice mid-project breaks audio continuity across already-rendered scenes. This file is the canonical record so a future agent (human or LLM) does not silently re-design a voice they cannot tell apart by ear.

**Authoritative skill.** `C:\Mango Studio\.claude\skills\character-voice-design\SKILL.md` (sections §1 seven-axis description, §3 cross-scene consistency, §6 audit checklist).

**Where these voices live in code.**

- `C:\mango-studio\packages\core\src\media\voices.ts` — `VOICE_POOL` array (6 entries, all premade).
- `C:\mango-studio\packages\core\src\media\audio-mode.ts` — voice resolution (narrator → `tts_voice_id`; character → `character.voice_id`; fallback → `VOICE_POOL[0]`).
- `C:\mango-studio\packages\core\src\media\video-prompts.ts` — `buildVoicePrompt` (resolver only, no actual voice prompt text).
- `C:\mango-studio\packages\core\src\llm\prompts.ts` lines 78–84 — Grok script-author sees the pool as RU labels with gender + tone only.

**Production route.** All Mango TTS goes through `fal-ai/elevenlabs/tts/multilingual-v2`, which uses the `eleven_multilingual_v2` model. **v3 audio tags (`[whispers]`, `[laughs]`, etc.) are NOT supported on this route.** Russian dialogue is supported by `eleven_multilingual_v2`.

**Pool verification status (2026-05-12, F29 pass).** Pool reconciled against the live ElevenLabs production catalog. 4 of the original 6 IDs (Rachel, Domi, Antoni, Arnold) were MISSING (404) and replaced with confirmed-live equivalents. 2 IDs (Adam, Bella→Sarah) were kept but had been renamed in the ElevenLabs catalog. All 6 IDs are now confirmed reachable. Changes committed in `fix(voices): reconcile pool against production catalog (F29)`.

---

## 1. Janet (`eLDc7xhWxG2FElT3kUTj`) — narrator default, female / нейтральный

**Replaced:** was `21m00Tcm4TlvDq8ikWAM` Rachel — MISSING in catalog (F29 verification 2026-05-12).

**ElevenLabs labels:** gender=female, accent=american, age=middle_aged, use_case=narrative_story.

**Description (catalog):** "A neutral-American accent woman with a reassuring tone."

**Preview URL:** see voice-pool-verify.sh output (F29 run).

### 7-axis persona

- **Physiology:** Mid-range female voice with moderate chest resonance; no vocal fry; clear articulation throughout.
- **Accent:** Neutral General American — no regional markers; broadcast-safe.
- **Timbre:** Smooth, slightly warm timbre; clean vowel formants; minimal breathiness.
- **Tempo:** Measured, narrator-pace; deliberate phrasing with natural sentence-level pauses.
- **Pitch:** Mid-soprano with controlled descents on cadence endings.
- **Baseline:** Reassuring and informative; emotionally even; trustworthy without being cold.
- **Speech patterns:** Subtle stress on key nouns; clean consonant onsets; natural paragraph-level rhythm.

**Russian (multilingual-v2):** Tone reads neutral-narrator in Russian; no overt American accent bleed reported.

### Mango voice_settings_default

- stability: 0.6
- similarity_boost: 0.75
- style: 0
- speed: 1.0

**Slot role:** narrator default — `MANGO_DEFAULT_NARRATOR_VOICE_ID` env override targets this slot when unset. `VOICE_POOL[0]` is the hard fallback in `audio-mode.ts`.

**Last reviewed:** 2026-05-12 (F29 reconciliation — replaced Rachel).

---

## 2. Adam (`pNInz6obpgDQGcFmaJgB`) — male / уверенный

**ID kept.** ElevenLabs renamed from "Adam" → "Adam - Dominant, Firm" (catalog 2026-05-12). Mango label stays "Adam"; tone updated from нейтральный → уверенный to reflect live catalog description.

**ElevenLabs labels:** gender=male, accent=american, age=middle_aged, use_case=social_media.

**Description (catalog):** "A bright tenor pitch that immediately cuts through. The delivery is dominant, firm."

**Preview URL:** see voice-pool-verify.sh output (F29 run).

### 7-axis persona

- **Physiology:** Adult male voice, tenor range; noticeable chest projection; controlled energy.
- **Accent:** General American — no strong regional markers.
- **Timbre:** Bright, cutting timbre; minimal warmth; clean attack on consonants.
- **Tempo:** Confident, direct pace; few hesitations; ends phrases with authority rather than trailing off.
- **Pitch:** Tenor — sits above typical baritone narrator range; bright top notes.
- **Baseline:** Dominant and firm; projects authority and decisiveness; not aggressive but clearly assertive.
- **Speech patterns:** Hard consonant onsets; strong stress on verbs and directives; minimal vocal softening.

**Casting note:** NOT a neutral voice despite the position-2 slot. Grok is instructed via the `уверенный` tone label. Best fit: authority figures, confident protagonists, antagonists with controlled demeanor.

**Russian (multilingual-v2):** Tone carries through in Russian; assertiveness preserved.

### Mango voice_settings_default

- stability: 0.5
- similarity_boost: 0.75
- style: 0
- speed: 1.0

**Last reviewed:** 2026-05-12 (F29 reconciliation — ID kept, label unchanged, tone updated).

---

## 3. Jessica (`cgSgspJ2msm6clMCkdW9`) — female young / молодой

**Replaced:** was `AZnzlk1XvdvUeBnXmlld` Domi — MISSING in catalog (F29 verification 2026-05-12).

**ElevenLabs labels:** gender=female, accent=american, age=young, use_case=conversational.

**Description (catalog):** "Young and popular, this playful American female voice is perfect for conversation, social media, gaming."

**Preview URL:** see voice-pool-verify.sh output (F29 run).

### 7-axis persona

- **Physiology:** Young adult female voice; light chest resonance; energetic breath support.
- **Accent:** Young General American — slight uptalk tendency natural to the voice; clear and accessible.
- **Timbre:** Bright, warm-bright timbre; no vocal grit; slightly breathy on soft passages.
- **Tempo:** Conversational pace; quick uptake between sentences; lively rhythm.
- **Pitch:** High-soprano tendency; naturally elevated range; animated inflection on key words.
- **Baseline:** Playful and warm; upbeat without being shrill; approachable and relatable.
- **Speech patterns:** Natural upspeak on questions; rising-falling intonation on declaratives; light glottal attack.

**Russian (multilingual-v2):** Youthful energy carries; some American phonetics may surface in Russian vowels.

### Mango voice_settings_default

- stability: 0.4
- similarity_boost: 0.7
- style: 0
- speed: 1.0

**Note:** Lower stability (0.4) intentional — preserves expressive/emotional variability for young character use.

**Last reviewed:** 2026-05-12 (F29 reconciliation — replaced Domi).

---

## 4. Sarah (`EXAVITQu4vr4xnSDxMaL`) — female soft / мягкий

**ID kept.** ElevenLabs renamed from "Bella" → "Sarah - Mature, Reassuring, Confident" (catalog 2026-05-12). Mango label updated from Bella → Sarah; tone мягкий preserved as it loosely maps to "Reassuring".

**ElevenLabs labels:** gender=female, accent=american, age=young, use_case=entertainment_tv.

**Description (catalog):** "Young adult woman with a confident and warm, mature quality."

**Preview URL:** see voice-pool-verify.sh output (F29 run).

### 7-axis persona

- **Physiology:** Young adult female voice with warm, slightly rounded resonance; controlled breath support.
- **Accent:** General American — clean, no strong regional coloring.
- **Timbre:** Smooth, warm timbre with a subtle richness; no harshness; mellow mid-range presence.
- **Tempo:** Slightly slower than Jessica — measured, reassuring pace; thoughtful phrasing.
- **Pitch:** Mid-soprano to mezzo; controlled with slight downward emphasis on conclusions.
- **Baseline:** Warm and reassuring; confident without aggression; safe and mature feel.
- **Speech patterns:** Soft consonant attacks; gentle emphasis on emotional keywords; closing phrases trail warmly.

**Russian (multilingual-v2):** Warmth and softness carry through to Russian; good fit for calm, expressive narration.

### Mango voice_settings_default

- stability: 0.55
- similarity_boost: 0.75
- style: 0
- speed: 0.95

**Note:** speed=0.95 intentional — subtle slowdown reinforces the soft/reassuring quality.

**Last reviewed:** 2026-05-12 (F29 reconciliation — ID kept, relabeled from Bella to Sarah).

---

## 5. George (`JBFqnCBsd6RMkjVDRZzb`) — male warm / тёплый

**Replaced:** was `ErXwobaYiN019PkySvjV` Antoni — MISSING in catalog (F29 verification 2026-05-12).

**ElevenLabs labels:** gender=male, accent=british, age=middle_aged, use_case=narrative_story.

**Description (catalog):** "Warm resonance that instantly captivates listeners."

**Preview URL:** see voice-pool-verify.sh output (F29 run).

### 7-axis persona

- **Physiology:** Middle-aged male voice with rich, rounded chest resonance; warm body in the lower-mid range.
- **Accent:** British Received Pronunciation (RP) / standard Southern British — clear, measured, refined.
- **Timbre:** Deep-warm timbre; natural resonance; non-threatening depth; captivating presence.
- **Tempo:** Deliberate, narrative pace; story-teller rhythm with organic pauses for dramatic effect.
- **Pitch:** Baritone; sits comfortably in the warm low-mid range; no strained high notes.
- **Baseline:** Warm, captivating, trustworthy storyteller; inviting emotional engagement without melodrama.
- **Speech patterns:** Round vowels (British RP); deliberate consonant clarity; slight lift on narrative highs; smooth glide between phrases.

**Russian (multilingual-v2):** British warmth survives; slight RP-influenced Russian accent possible but pleasant.

### Mango voice_settings_default

- stability: 0.5
- similarity_boost: 0.75
- style: 0
- speed: 1.0

**Last reviewed:** 2026-05-12 (F29 reconciliation — replaced Antoni).

---

## 6. Daniel (`onwK4e9ZLuTAKqWW03F9`) — male serious / серьёзный

**Replaced:** was `VR6AewLTigWG4xSOukaG` Arnold — MISSING in catalog (F29 verification 2026-05-12).

**ElevenLabs labels:** gender=male, accent=british, age=middle_aged, use_case=informative_educational.

**Description (catalog):** "A strong voice perfect for delivering a professional broadcast."

**Preview URL:** see voice-pool-verify.sh output (F29 run).

### 7-axis persona

- **Physiology:** Middle-aged male voice with firm, controlled projection; broadcast-trained quality.
- **Accent:** British — professional broadcast standard; clear, authoritative, polished.
- **Timbre:** Strong, clear timbre; minimal warmth compared to George; controlled and focused.
- **Tempo:** Steady, professional broadcast pace; even delivery without emotional fluctuation.
- **Pitch:** Mid-baritone; stable and grounded; does not wander.
- **Baseline:** Serious, professional, informative; steady broadcaster quality; measured gravitas.
- **Speech patterns:** Precise consonant articulation; flat intonation on factual statements; strong downbeats on important clauses.

**Russian (multilingual-v2):** Professional tone translates; minimal accent interference in Russian.

### Mango voice_settings_default

- stability: 0.55
- similarity_boost: 0.75
- style: 0
- speed: 0.95

**Note:** speed=0.95 intentional — slight slowdown reinforces serious/broadcast clarity.

**Last reviewed:** 2026-05-12 (F29 reconciliation — replaced Arnold).

---

## Maintenance protocol

1. **Never silently swap a `voice_id`.** Once a character row has `voice_id = X`, that binding is permanent. To replace it, see finding F36 (set_character_voice tool, refused if any voice_audio_versions exist).
2. **Update this file on every voice change.** New voice added → new section. Voice retired → mark `retired_at: <date>`, do NOT delete (history record).
3. **Re-verify pool quarterly.** ElevenLabs has rebranded / retired premade voices in the past. Run `GET /v1/voices?category=premade` via production API key; reconcile against this file.
4. **Pin settings on first character binding.** When the first project commits a character to a voice, also commit `stability`, `similarity_boost`, `style`, `speed` to this file alongside.
5. **Generate a reference clip per voice.** ~80-char Russian sentence that exercises emotional range. Save to `assets/voices/<label>_ref.mp3`.

## Retired voices (F29 reconciliation 2026-05-12)

| Label | ID | Reason | Replaced by |
|---|---|---|---|
| Rachel | `21m00Tcm4TlvDq8ikWAM` | MISSING from ElevenLabs catalog | Janet `eLDc7xhWxG2FElT3kUTj` |
| Domi | `AZnzlk1XvdvUeBnXmlld` | MISSING from ElevenLabs catalog | Jessica `cgSgspJ2msm6clMCkdW9` |
| Antoni | `ErXwobaYiN019PkySvjV` | MISSING from ElevenLabs catalog | George `JBFqnCBsd6RMkjVDRZzb` |
| Arnold | `VR6AewLTigWG4xSOukaG` | MISSING from ElevenLabs catalog | Daniel `onwK4e9ZLuTAKqWW03F9` |

## Open questions for Phase 1.4+

- Should the pool expand beyond 6? (Cartoons typically need: child / teen / young-adult / mature / elderly × 2 genders + 2 narrators = 12 minimum for variety.)
- Should premium projects route to `eleven_v3` for audio-tag support? (Finding F31.)
- Should `narrator_voice` be a project-authored persona (with 7-axis description), not a voice_id picker? (Finding F33, F35.)
- Generate reference clips per voice using production fal.ai key with Russian sample text; save to `assets/voices/<label>_ref.mp3`.
