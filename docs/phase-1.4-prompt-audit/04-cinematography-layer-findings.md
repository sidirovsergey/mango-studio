# Phase 1.4 — Prompt Audit · Cinematography Layer Findings

_Score the image and video prompts against the `cinematography-language` skill and `seedance-cinematography.md` reference._

Four prompt surfaces in this layer:

- `buildAvatarPrompt` — 1:1 character portrait (nano-banana 2 / pro)
- `buildDossierPrompt` — 16:9 multi-pose model sheet (nano-banana 2 / pro)
- `buildFirstFramePrompt` — image-to-image with character refs + composition (nano-banana 2 / pro)
- `buildVideoPrompt` — image-to-video for **5 different engines** (Seedance Lite, Seedance 2.0, Veo 3.1, Kling 2.5, LTX)

Findings numbered **F50+** to leave room for the parallel voice-pass output (F29–F49 reserved).

---

## A. `buildAvatarPrompt` ([packages/core/src/media/prompts.ts:39](C:/mango-studio/packages/core/src/media/prompts.ts))

Russian, 1:1 close-up portrait on pure white. Mostly OK — this is a contained surface.

### Cinematography audit checklist

| Axis | Status | Notes |
|---|---|---|
| Shot size specified | ✔ | "Голова и плечи, лицо в центре" — head and shoulders |
| Camera angle named | ✔ | "3/4 поворот", "немного в сторону от камеры" |
| Lighting recipe | ◔ | "ровный профессиональный студийный свет, мягкий ключевой источник" — direction implied but no key-fill ratio, no rim light spec |
| Lens / optical effect | ✘ | Not specified. For an animated portrait this is acceptable. |
| Physics / material | ✘ | Style preamble for 3d_pixar mentions "subsurface scattering on skin" implicitly via "мягкое объёмное освещение" — weak |
| Single coherent beat | ✔ | Static portrait |
| Engine-appropriate | ✔ | nano-banana takes plain language |

### Findings

- **F50 — Russian prompt to English-biased image model.** nano-banana-2 and nano-banana-pro are English-trained foundation models. Russian works on simple prompts but degrades on long detailed ones. Round-trip test needed; depending on result, generate an English-mirror prompt for the model and keep Russian only for human-readable logs.
- **F51 — Style preamble ambiguous.** `STYLE_PREAMBLE['3d_pixar']` says "3D Pixar-style CGI рендер, мягкое объёмное освещение, выразительные глаза, мультяшные пропорции, проработанные текстуры." Pixar style varies dramatically across films (Toy Story vs Inside Out vs Soul). Tighten with one reference film and 2-3 stylistic anchors (e.g., "Pixar 'Coco' look — bold silhouettes, saturated palette, soft volumetric rim light, large expressive eyes, subsurface scattering on skin").
- **F52 — Negative-only directives.** "БЕЗ окружения, без теней на фоне, без текста, без подписей, без аннотаций" — Anthropic best practice: say what to do. Pair with positive: "Background: pure white #FFFFFF, edge-to-edge, no environmental elements."

---

## B. `buildDossierPrompt` ([packages/core/src/media/prompts.ts:65](C:/mango-studio/packages/core/src/media/prompts.ts))

16:9 multi-pose model sheet. **The most architecturally questionable surface in the pipeline.**

### Findings

- **F53 — CRITICAL: multi-panel composition fights downstream first-frame gen.** This prompt asks nano-banana to produce a single 16:9 image containing N separate views (expressions, poses, detail shots). Later, [`buildFirstFramePrompt`](C:/mango-studio/packages/core/src/media/video-prompts.ts:54-56) sends this same image to image-gen as a "character reference" and **fights it** for an entire paragraph: "DO NOT replicate the layout, multi-panel composition, side-by-side poses, captions, or background of the reference". This is a self-inflicted wound: we authored a panel-grid, now we tell the model not to copy the panel-grid.
  - **Fix path A (additive):** alongside the 16:9 dossier (kept for human QA), generate a separate set of single-pose reference cells: `{ neutral_portrait, joyful_action, profile_view, full_body_standing }`. Use the most-relevant cell — or the neutral portrait — as the character reference in `buildFirstFramePrompt`. Multi-panel grid goes only to humans.
  - **Fix path B (subtractive):** drop the dossier entirely. Use only the 1:1 avatar as character reference. Costs less, fewer continuity bugs, but humans lose the model-sheet QA surface.
  - Recommend path A.
- **F54 — Cyrillic text inside generated image.** "ВСЕ подписи под ячейками model-sheet — ТОЛЬКО на русском языке кириллицей". nano-banana renders Cyrillic in-image inconsistently — sometimes the model writes glyphs that look like Russian but are gibberish. Round-trip test needed. If broken, either accept English captions in the dossier or render captions as a UI overlay (post-process) instead of asking the model to render text.
- **F55 — Negative-only spacing rule.** "БЕЗ рамок, БЕЗ обводки, БЕЗ разделительных линий между ячейками". Replace with positive: "Cells separated by even white margins of approximately 5% canvas width; flat white background flows continuously between cells; no graphic dividers."
- **F56 — No turnaround discipline.** Animation model-sheets typically include turnarounds (front / 3/4 / profile / back) so the character can be redrawn from any angle. We ask for "several poses" without specifying angle coverage. Result: dossier may have 4 frontal poses and zero side views.

---

## C. `buildFirstFramePrompt` ([packages/core/src/media/video-prompts.ts:24](C:/mango-studio/packages/core/src/media/video-prompts.ts))

Image-to-image: scene description + character refs + (optional) prev_last_frame → single 9:16 frame. **The hinge that determines whether scenes 1, 2, 3 look like the same cartoon.**

### Cinematography audit checklist (applied to image gen)

| Axis | Status | Notes |
|---|---|---|
| Shot size specified | ✘ | "ONE SINGLE cinematic frame" — vague |
| Camera position / angle | ✘ | Not specified beyond aspect ratio |
| Lighting recipe | ✘ | Not specified — relies on `project_style` enum string |
| Lens / optical effect | ✘ | Not specified |
| Physics / material | ✘ | Not specified |
| Engine-appropriate | ◔ | English (good for nano-banana) but no model-specific grammar |

**0/5 load-bearing axes** specified. The image gen has to invent everything from `scene.description` (one Russian paragraph from Grok).

### Findings

- **F57 — CRITICAL: `composition_hint` is dead code.** Line 64: `scene.composition_hint ?? ''`. Field exists in scene schema, never populated by script generation (verified vs F2 in director-layer findings). Effective payload is empty string. Three options: (a) populate from script-gen as part of the F2 fix (structured per-shot fields); (b) populate from Director Agent before image gen; (c) remove the field. Recommend (a).
- **F58 — `Style: ${project_style}` sends raw enum value.** Line 60. `project_style` is e.g. `"3d_pixar"` — a programmatic identifier, not a human-readable style. The model sees the literal string `"3d_pixar"`. Replace with the human-readable `STYLE_NAME` map or with the full `STYLE_PREAMBLE` (same map already exists in [`media/prompts.ts:24`](C:/mango-studio/packages/core/src/media/prompts.ts)).
- **F59 — prev_last_frame attached without grammar.** Line 32-34: we push `prev_last_frame` into `refs` for `first_frame_source === 'auto_continuity'` but the prompt never says "use the attached previous-frame image as the color-grading, lighting-direction, and time-of-day reference for this new shot". Without that, image gen treats it as just another visual input alongside the character sheet. The continuity model is implicit and breaks subtly across scenes.
- **F60 — Multi-character ordering not specified.** Line 50-52: "They appear together in the same shot, interacting naturally, consistent designs." No foreground / background, no left / right, no eyeline. For 3-character scenes nano-banana arranges arbitrarily — and that arrangement won't match scene 2 even with the same characters.
- **F61 — REF_LIMIT=5 is fine for nano-banana but fills under load.** Line 6. 3 characters + prev_last_frame = 4 of 5 slots. Once Visual Theme image (post F1 fix) is added, slots are exhausted. Need a priority order: prev_last_frame → visual_theme → main characters → minor characters.
- **F62 — No negative prompt.** Add: "Avoid: text or captions in the image, watermarks, multiple disconnected vignettes, panel borders, lens flares masking subject faces."
- **F63 — `OUTPUT FORMAT — ONE SINGLE cinematic frame in 9:16` is good** but "cinematic" is an adjective. Replace with concrete framing: shot size (from F2 fix), camera height, lens character ("85mm equivalent shallow DOF" for portrait beats, "24mm equivalent deep focus" for wide beats).
- **F64 — Russian `scene.description` sent to English-biased model.** Same root cause as F9 in director-layer findings. The English `description_en` field proposed in F9 must be implemented for this surface to benefit.

---

## D. `buildVideoPrompt` ([packages/core/src/media/video-prompts.ts:74](C:/mango-studio/packages/core/src/media/video-prompts.ts))

**The single highest-leverage prompt surface in the pipeline, and currently the worst-engineered.**

Effective payload sent to all 5 video engines:

```
<russian scene description from Grok>

<one of three generic motion strings: "short cinematic motion, single beat" | "medium cinematic motion with character action" | "extended scene with multiple beats">

<optional dialogue line if model.has_native_audio && scene.dialogue !== null>
```

That is the entire video prompt. Same string for Seedance Lite, Seedance 2.0, Veo 3.1, Kling 2.5, LTX.

### Cinematography audit checklist

| Axis | Status | Notes |
|---|---|---|
| Shot size | ✘ | Whatever is in `scene.description` |
| Camera movement | ✘ | "cinematic motion" — not a verb |
| Lighting recipe | ✘ | None |
| Lens / optical | ✘ | None |
| Physics / material | ✘ | None |
| Single coherent beat | ◔ | "single beat" string for ≤5s — declarative, not enforced |
| Engine-appropriate | ✘ | **Same prompt to 5 different engines** |

**0/7. The cinematography layer is effectively absent.**

### Seedance 2.0 Director Brief comparison (the engine we ship Premium on)

| Component | Required by skill | Current prompt |
|---|---|---|
| `[SCENE]` Environment + Lighting | ✔ | only env (from description), no lighting |
| `[SUBJECT]` Identity + Detail | ✔ | only via attached first_frame image |
| `[ACTION]` Fluid Interaction | ✔ | in description, freeform |
| `[CAMERA]` Movement + Lens + Speed | ✔ | absent |
| `[AUDIO]` Music + SFX + Ambience | **MANDATORY** | absent — only dialogue when native |
| `[Pacing/Style]` Timing + Grade | ✔ | absent |
| Time-segments for >5s | ✔ | absent (one declarative paragraph regardless of duration) |
| Negative prompt (`Avoid: ...`) | recommended | absent |

**8/8 missing.** The engine is generating cartoons from a poem.

### Findings

- **F65 — CRITICAL: One prompt for five engines.** Per `prompt-engineering-baseline` anti-pattern #10: "One prompt for all engines — cannot be the same string sent to Veo and Seedance." Veo wants block grammar, Seedance wants time-segments, Kling wants beat markers, Sora wants cause-effect chains, LTX is permissive. Currently all five get the same Russian paragraph.
  - Fix: per-engine `buildVideoPrompt` variants, dispatched on `model` ID. Shared input (`scene.description`, `dialogue`, `first_frame_storage`, `duration_sec`) → engine-specific output. Engine grammar is in `cinematography-language/references/seedance-cinematography.md` for Seedance; `prompt-engineering-baseline/SKILL.md §"Per-engine prompt variants"` covers the other four.
- **F66 — CRITICAL: No audio direction for Seedance 2.0.** Native-audio engine. Per the Seedance reference: "Always include an Audio directive — even one sentence. Without it the model generates random ambient sound that may not match your scene." We only include dialogue when `include_dialogue` is true; for silent_tts scenes (which is **every Russian scene** because `audio-mode.ts` forces silent_tts on Cyrillic) Seedance 2.0 still generates audio natively — random ambient that we then have to ffmpeg-mux over with TTS. Often clashes.
  - Fix: for `silent_tts` scenes on a native-audio model, emit `[AUDIO] No dialogue, no music; ambient room tone only. Voice will be dubbed in post.` This tells Seedance to produce a quiet bed that won't fight the TTS layer.
- **F67 — CRITICAL: No time-segmented prompts for >5s scenes.** Premium tier Seedance 2.0 supports 4–12s; native-audio Veo 3.1 is fixed 8s; Kling Pro is 5/10s. A 10s scene gets the string "medium cinematic motion with character action" — gives the model nothing to time against. Fix: for >5s, emit explicit segments based on the duration (e.g., 10s → `0–3s / 3–7s / 7–10s` with one action per segment).
- **F68 — CRITICAL: `motion_rule` is content-free.** "short cinematic motion, single beat" / "medium cinematic motion with character action" / "extended scene with multiple beats" — these are descriptions of the *problem*, not cinematic directives. Per `cinematography-language` skill §"Prompt Optimization Protocol": "Motion Dynamics — use cinematic verbs: Dolly In, Crane Up, Orbit, Truck, Whip Pan." Currently zero cinematic verbs. Fix: motion_rule is derived from the per-shot `camera_movement` field (post F2).
- **F69 — No physics directives.** Per the skill: "Neon reflections shimmering on rain-slicked asphalt", "Caustic patterns on the ceiling", "Subsurface scattering on translucent skin". Currently absent. Image-to-video models can leverage these but only when asked.
- **F70 — No negative prompt for Seedance.** Common additions per the reference: `Avoid: abrupt cuts, scene changes, multiple locations.` for single-take shots; `Avoid: human faces, realistic people.` for non-character beats; `Avoid: fast motion, blur, unstable framing.` for smooth reveals. Currently none.
- **F71 — No `[Pacing/Style]` color-grade line.** Per the skill: "Cinematic epic, warm color grade, shallow DOF. Slow build — single action only, no scene cuts." or "Roger Deakins natural-light palette, muted teal and amber, fine grain. 24fps." Currently absent.
- **F72 — No `@Image1` reference grammar.** First-frame image is attached via `image_refs: [first_frame_storage]` but the prompt never says "the attached image is `@Image1`, the exact first frame of this shot; continue motion from there." Per Seedance reference §"Character Consistency" the explicit grammar helps; without it, models sometimes drop the first frame's pose.
- **F73 — Russian dialogue + native-audio model → empty quotes bug.** Line 104-106:
  ```
  include_dialogue && scene.dialogue
    ? `${scene.dialogue.speaker === 'narrator' ? 'Narrator' : 'Character'} says: "${scene.dialogue.text}"`
    : ''
  ```
  For a premium-tier scene with `dialogue: { speaker: 'narrator', text: 'Привет' }`, `audio-mode.resolveAudioMode` returns `silent_tts` (Cyrillic detected). But `include_dialogue` is `meta?.has_native_audio === true` which is checked independently of audio_mode. Result: Seedance 2.0 gets `Narrator says: "Привет"` literally — the engine will try to render this and produce muddled audio that the TTS pipeline later overlays with the same line in a different voice. **Bug.**
  - Fix: `include_dialogue` should be `audio_mode === 'native'`, not just `has_native_audio`. The resolved audio_mode is the source of truth.
- **F74 — Russian scene description sent to English-biased video engines.** Seedance 2.0 has Chinese ancestry (ByteDance) and handles non-English better than Veo; Kling 2.5 likewise. Veo 3.1 is strongest in English. LTX is permissive but quality varies. Same root cause as F9, F64 — needs the English-mirror `description_en` field.
- **F75 — `motion_rule` for 11–30s ("extended scene with multiple beats") is impossible on every supported engine.** Seedance 2.0 max = 12s; Veo 3.1 = 8s fixed; Kling = 10s; Seedance Lite = 10s; LTX = 10s. There is no engine in the registry that can do 11s+ in one shot. The branch is dead. Either we plan to split into multiple shots (Seedance Multi-Take grammar) or the branch should never fire. Currently the script generator can emit `duration_sec: 30` and the clamp logic in [`video-models.ts:116`](C:/mango-studio/packages/core/src/media/video-models.ts) silently rounds down.
- **F76 — No subject vs background discipline.** For 3-character action scenes, the engine has to decide who's in the foreground each frame. Currently no hint is given. Fix: per-shot `subject_focus: character_id` field (post F2).
- **F77 — No reference to character `voice` description for Veo 3.1 native dialogue.** If a Premium scene with English dialogue routes to Veo 3.1 (rare with our RU detection but possible), the prompt currently passes only the spoken text. Veo can approximate speaking style if given character description ("an aged, gravelly male voice"). Currently absent.
- **F78 — No `aspect_ratio` enforcement reminder.** Line 110 hardcodes `aspect_ratio: '9:16'` in the return value, but the prompt text never says "vertical 9:16 portrait orientation". Models that support multiple aspects (Seedance 2.0, Veo, Kling) sometimes return horizontal compositions if the prompt's framing implies landscape (wide vista, panorama). The API parameter caps the output, but the model may render a horizontally-composed scene cropped to vertical. Add explicit "Vertical 9:16 portrait composition. Frame action and faces for vertical viewing — no wide horizons cropped at the edges."

---

## E. Anti-patterns ledger (per `cinematography-language` §"Common Mistakes to Avoid")

| Anti-pattern | Triggered in our code? |
|---|---|
| 1. Vague references — "reference @Video1" without specifying what | n/a (no video refs) |
| 2. Conflicting instructions (static camera + orbit) | not currently |
| 3. Overloading scenes | possible via Grok freeform description |
| 4. Missing @ assignments | **yes** — first frame attached as image without `@Image1` grammar (F72) |
| 5. Ignoring audio | **yes** — F66 |
| 6. Forgetting duration | duration is sent via API param; not in prompt text either (could go either way) |
| 7. Real human faces | n/a (cartoon-only) |
| 8. Keyword soup "8k, masterpiece, trending" | **no** ✔ (this part is clean) |
| 9. Discontinuous action ("runs and then stops") | possible via Grok freeform |
| 10. Missing audio direction for Seedance | **yes** — F66 |
| 11. Narrative overload per segment | possible via Grok freeform — F4 root cause |
| 12. FPV without continuous motion | not currently triggered |
| 13. Drone without a destination | not currently triggered |

5 of 13 anti-patterns are triggered or possible. The bottom-level "keyword soup" hygiene is clean — the higher-order structural issues are the problem.

---

## Sub-totals

| Surface | Findings | Severity |
|---|---|---|
| `buildAvatarPrompt` | F50–F52 | hygiene |
| `buildDossierPrompt` | F53–F56 | F53 critical (architectural — multi-panel reference) |
| `buildFirstFramePrompt` | F57–F64 | F57 critical (dead composition_hint); F59, F60, F64 important |
| `buildVideoPrompt` | F65–F78 | **F65, F66, F67, F68 critical** — these are the four reasons video is bad |

**Total: 29 findings, of which 6 are critical (F53, F57, F65, F66, F67, F68).**

The big four for video quality: **engine-aware prompts** (F65), **audio direction for Seedance** (F66), **time-segmented prompts** (F67), **real camera verbs** (F68). All four depend on F2 from director-layer (structured per-shot fields in the script schema) — they can't be fixed in isolation.

## Dependencies on director-layer findings

| Cinematography fix | Depends on director-layer fix |
|---|---|
| F57 (composition_hint dead code) | F2 (structured scene fields) |
| F60 (multi-char ordering) | F2 |
| F64 (English mirror description) | F9 (description_en field at script-gen) |
| F65 (engine-aware video prompts) | F2 + F10 (tier passed to author) |
| F67 (time-segmented prompts) | F2 (per-segment fields) |
| F68 (camera verbs in motion_rule) | F2 (camera_movement field) |
| F76 (subject_focus) | F2 |
| F78 (vertical composition discipline) | F1 (Visual Theme — motion language) |

**The cinematography layer cannot be fixed without first fixing the director layer's structured-fields foundation (F1–F4).** Order of operations matters for the plan doc.
