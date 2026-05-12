# F29 Voice Pool Verification

This document captures the live state of Mango Studio's 6 ElevenLabs voice IDs as of the verification run. It is the input for Phase 1.4.E.T9 — reconciling `packages/core/src/media/voices.ts` and `voices.md` against the production catalog.

## How to run

```bash
ELEVENLABS_API_KEY=sk_... ./scripts/voice-pool-verify.sh > /tmp/voice-pool-result.txt
```

The script requires `bash`, `curl`, and `jq`. For environments without `jq`, an inline Node-based equivalent is documented in this file's git history (commit `<F29-pre-flight>` Bash transcript).

## Result — 2026-05-12

**Catalog size:** 27 premade voices on the API account at run time.

**Summary:** 4 of 6 Mango pool IDs returned MISSING (404); 2 IDs are present but RENAMED. The pool requires substantive reconciliation in T9.

| Slot id (mango) | live state | live name | live labels | preview / notes |
|---|---|---|---|---|
| `21m00Tcm4TlvDq8ikWAM` (Rachel — female / neutral / narrator default) | MISSING (404) | — | — | Replacement required. |
| `pNInz6obpgDQGcFmaJgB` (Adam — male / neutral) | RENAMED | **Adam - Dominant, Firm** | gender=male, accent=american, age=middle_aged, use_case=social_media | ID preserved. Re-label and re-classify tone (was "нейтральный", live description is "Dominant, Firm" — closer to "уверенный"). |
| `AZnzlk1XvdvUeBnXmlld` (Domi — female / young) | MISSING (404) | — | — | Replacement required. |
| `EXAVITQu4vr4xnSDxMaL` (Bella — female / soft) | RENAMED | **Sarah - Mature, Reassuring, Confident** | gender=female, accent=american, age=young, use_case=entertainment_tv | ID preserved. Relabel "Bella" → "Sarah". Tone "Reassuring, Confident" still maps to "soft / warm" slot reasonably; consider re-classifying to "уверенный". |
| `ErXwobaYiN019PkySvjV` (Antoni — male / warm) | MISSING (404) | — | — | Replacement required. |
| `VR6AewLTigWG4xSOukaG` (Arnold — male / serious) | MISSING (404) | — | — | Replacement required. |

## Proposed replacements (for 1.4.E.T9)

Selected from the live premade catalog to match each missing slot's gender / tone / role intent. Final selection happens in T9 after listening to preview clips.

| Mango slot (role) | Proposed `voice_id` | Live name | Rationale |
|---|---|---|---|
| narrator default — female / neutral | `eLDc7xhWxG2FElT3kUTj` | **Janet** | "Neutral-American accent woman with a reassuring tone." Explicitly matches "neutral" + narrator (use_case=narrative_story). |
| male / neutral | `pNInz6obpgDQGcFmaJgB` (KEEP) | Adam - Dominant, Firm | ID is still live; relabel to "Adam" in Mango UI; tone field changes to "уверенный". |
| female / young | `cgSgspJ2msm6clMCkdW9` | **Jessica - Playful, Bright, Warm** | gender=female, age=young, use_case=conversational. Best young-female match in catalog. |
| female / soft | `EXAVITQu4vr4xnSDxMaL` (KEEP, relabel) | Sarah - Mature, Reassuring, Confident | ID is still live; relabel "Bella" → "Sarah"; tone field can stay "мягкий" or shift to "уверенный". |
| male / warm | `JBFqnCBsd6RMkjVDRZzb` | **George - Warm, Captivating Storyteller** | gender=male, accent=british, age=middle_aged, use_case=narrative_story. The catalog's most literal "warm" match. |
| male / serious | `onwK4e9ZLuTAKqWW03F9` | **Daniel - Steady Broadcaster** | gender=male, accent=british, age=middle_aged, use_case=informative_educational. "Strong voice perfect for delivering a professional broadcast" — exactly the "serious" slot. |

### Russian-language support note

None of the catalog labels explicitly mark Russian support in `labels.language` — ElevenLabs' premade voices are language-agnostic when used via the `eleven_multilingual_v2` model. The Mango runtime already pins `model_id: eleven_multilingual_v2` for TTS. T9 must verify each proposed replacement renders Russian cleanly via a one-shot TTS sandbox test before swapping IDs into `voices.ts`.

## Next steps for 1.4.E.T9

For each voice row:

- `status: OK` → no change in `voices.ts`; fill the 7-axis stub in `voices.md` (Physiology, Accent, Timbre, Tempo, Pitch, Baseline, Speech patterns) by listening to the preview URL and consulting the ElevenLabs voice `labels` payload.
- `status: RENAMED` → update the Mango label in `voices.ts` + `voices.md` to the live name; document the rebrand in the commit message.
- `status: MISSING (404)` → choose a replacement from the catalog matching the original slot's gender/tone (see "Proposed replacements" above); update both files; document the swap.

The `MANGO_DEFAULT_NARRATOR_VOICE_ID` environment override pins to the first pool entry (currently the missing Rachel ID). T9 will either change the override or accept the new first-entry default once the pool is reconciled.
