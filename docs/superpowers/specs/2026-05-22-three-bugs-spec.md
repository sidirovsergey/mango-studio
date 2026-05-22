# Three production bugs — root cause + fix spec

**Date:** 2026-05-22
**Branch:** new (not yet created)
**Parent commit:** `682c883` (PR #51 merged)
**Audience:** Codex pre-implementation design review

## Context

User reported three issues on prod after PR #51 deployed and they created a fresh CJM project. Direct quote (Russian, paraphrased):

1. **"Один персонаж в разных сценах разный"** — character looks different in every storyboard scene; dossier+reference_image apparently not used during first_frame generation.
2. **"Нажимаю «Сгенерировать досье», кнопка грузится → возвращается в норму → надо закрыть и переоткрыть popup, чтобы увидеть досье"** — dossier popup doesn't auto-refresh; user has to close+reopen to see the generated dossier.
3. **"Нажимаю «Сгенерировать кадр» в workspace → грузится → картинка не открывается, ошибка «Не найдено изображение сцены S1»"** — broken image in workspace scene thumbnail despite having generated successfully (storyboard /p/{slug} shows the image fine).

User wants all three fixed exemplary-quality, Codex-collaborated, single coherent effort.

## Evidence gathered

User's project (the one in the screenshot):
- ID: `282720fe-ebca-4e94-97a6-a3d4d2333c93`
- Slug: `2X8Ds1ehGi`
- Created 2026-05-22 17:25:59 (post-PR-#51 merge)
- 4 scenes (s1..s4), 1 character ("Финн")
- All 4 first_frame jobs **completed** before the dossier was generated:
  - first_frame s1-s4: submitted 17:26:33-34, completed by 17:26:56
  - character_dossier: submitted 17:30:15 (only after user clicked "Сгенерировать досье" in workspace) → completed 17:30:31
  - character_reference_image: auto-chained at 17:30:32 → completed 17:30:49
  - second first_frame for s1: 17:31:26 → 17:31:44 (v2 of 2)

Script structure (from Supabase MCP query against project_id `qemjzzcxozaegaxstmwm`):
```json
{
  "characters": [
    { "id": "fddb649f-f603-4685-845d-636f20c29748", "name": "Финн",
      "has_dossier": true, "has_ref_img": true }
  ],
  "scenes": [
    { "scene_id": "s1", "character_ids": ["Финн"], ... },
    { "scene_id": "s2", "character_ids": ["Финн"], ... },
    { "scene_id": "s3", "character_ids": ["Финн"], ... },
    { "scene_id": "s4", "character_ids": ["Финн"], ... }
  ]
}
```

`character_ids` contains the character NAME (string `"Финн"`), not the UUID `"fddb649f-…"`. This explains Problem 1 — see below.

For Problem 3 — first_frame_versions for s1:
```json
{ "storage": { "kind": "supabase", "bucket": "scene-assets",
               "path": "0be8f5cf-…/282720fe-…/s1/cf9ad3f2-…-frame.png" } }
```

> **Spec revised 2026-05-22 after Codex round-1 audit.** Two BLOCKERS surfaced:
> 1. `linkSceneCharacterIds` alone doesn't deliver visual character consistency — `buildFirstFramePrompt` pushes `dossier.reference_image` into `image_refs`, but at CJM bulk-submit time dossier hasn't been generated yet. Image refs stay empty → first_frames still inconsistent visually. Spec was missing the character preflight step.
> 2. Problem 2's root cause was incomplete. `ProjectJobsPoller` already runs `router.refresh()` every 5s — refresh works. Real cause: `CharacterModalClient` doesn't render the dossier image at all (only the form); the image lives in `StageCharacters` cards BEHIND the modal. User can't see the result without closing.
>
> Sections below reflect the revised plan. Original text preserved in commit history.

---

## Problem 1 — character_ids name/UUID mismatch + missing image refs (REVISED)

**Code path:**

`packages/core/src/llm/prompts.ts:133-156` — the system prompt for `generateScript` explicitly instructs the LLM:
> `character_ids` — empty `[]` if no characters in scene; otherwise list character **names** (for 'add' actions names are used as references **until ids are assigned by server**).

So the LLM emits character names by design, with the assumption that the server will swap names → UUIDs after running `applyCharacterActions` (which generates UUIDs for new characters).

**The swap never happens.** `apps/web/src/server/actions/scripts.ts` in `generateScriptAction` (and `regenScriptAction`, `refineScriptAction`):
```ts
const mergedCharacters = applyCharacterActions([], result.output.characters);
const newScript: PersistedScript = {
  title: result.output.title,
  scenes: result.output.scenes,  // ← scenes' character_ids[] still hold NAMES from LLM
  characters: mergedCharacters,  // ← UUIDs assigned here, never propagated back
  ...
};
await persistScript(project_id, newScript);
```

**Downstream impact:**

`apps/web/src/server/actions/generateFirstFrameAction.ts:111-114`:
```ts
const characters_in_scene = (script.characters ?? []).filter((c) =>
  scene.character_ids.includes(c.id),  // c.id is UUID, scene.character_ids has names
);
```

`characters_in_scene` is empty for every scene → no character refs passed to `buildFirstFramePrompt` → first_frame is generated with no character anchoring → each scene renders a fresh "interpretation" of "Финн" → user sees different characters.

The F53 precondition check (would have triggered reference-image generation) also doesn't fire because it operates on `characters_in_scene` which is empty.

**Why this hasn't bitten before:**
- Pre-1.8.2, the workspace flow's `generateFirstFrameAction` was usually called from chat-tools / direct UI clicks, often after the user had already generated a dossier. The flow still missed the character ref (same bug), but users tolerated stylistic inconsistency in early demos.
- Phase 1.8.2 CJM made this user-visible because first_frames now batch-render at script-creation time, and users immediately see all 4 scenes side-by-side on the storyboard view — making the inconsistency glaring.

**Proposed fix — two layers:**

### Layer 1: text anchoring — `linkSceneCharacterIds` helper (necessary but insufficient)

Add a pure helper `linkSceneCharacterIds(scenes, characters): { scenes, warnings }` that walks each scene's `character_ids[]` and replaces name entries with the matching `character.id` UUIDs (case-insensitive). Returns warnings array (per Codex round-1 NIT — log in caller, not in core).

Drop both orphan-name AND orphan-UUID entries with warnings (per Codex). Tolerant mixed input — no strict-after-first-pass mode.

Apply in `generateScriptAction`, `regenScriptAction`, `refineScriptAction` AFTER `applyCharacterActions`, BEFORE `persistScript`. Log warnings with `project_id`.

Location: new module `packages/core/src/llm/link-scene-character-ids.ts`, exported via `packages/core/src/llm/index.ts`.

### Layer 2: image anchoring — character preflight before bulk first_frames

Without this, even after Layer 1 the user-visible "different Финн in every scene" doesn't go away. `buildFirstFramePrompt` populates `image_refs` from `dossier.reference_image` (see [first-frame.ts:94](packages/core/src/media/image-prompts/first-frame.ts:94)). At CJM bulk-submit time, characters from `applyCharacterActions` have NO dossier — that field is populated only after `character_dossier` + `character_reference_image` fal jobs complete. Result: `image_refs = []` → nano-banana renders text-prompted character → different look per scene.

**New step in `createProjectFromIdeaAction.after()`:** between `generateScriptAction` and `generateAllFirstFramesAction`, run a character preflight that:

1. For each `character` in script that lacks `dossier.reference_image` AND `dossier.storage`: submit a `character_dossier` job (via existing `generateCharacterDossierAction`).
2. Reconcile via `pollMediaJobsAction({skipReferenceRecovery: false})` (note: `false` here, NOT `true` like the first_frame reconcile — we WANT the F53 chain to auto-fire `character_reference_image` after each dossier completes).
3. Loop until all characters have `dossier.reference_image` populated OR a 90s budget elapses.
4. On budget exceeded: log + proceed to bulk first_frames anyway — partial consistency is better than total failure. The scenes without char-anchored prompts will look inconsistent but at least the project ships.

Total revised after()-flow budget:
- generateScriptAction: ~30s
- character dossier preflight (parallel submit, ~20s fal): ~25s
- character reference_image (chained after dossier, ~20s fal): ~25s
- bulk first_frames + retry: ~5s submit
- reconcileFirstFrames: ~30-60s
- **Total: ~115-145s** of 300s Vercel maxDuration. Tight but feasible.

Per Codex's SHOULD-FIX: extract `reconcileCharacterPreflight({project_id, deps, config?})` as a new module mirroring `reconcile-first-frames.ts` — discriminated result, injected deps for testability.

Location: new module `apps/web/src/server/lib/reconcile-character-preflight.ts`.

### Why this is two layers, not one

Layer 1 is also needed independently:
- Workspace flow (`/projects/{id}/`) where user manually generates dossier first, then clicks "Сгенерировать кадр" per scene — without UUID linkage, F53 precondition + char-ref code paths all break for the same name-vs-UUID reason.
- Refine flow — `regenScriptAction`, `refineScriptAction` re-emit scenes with name-style `character_ids` even when characters already have UUIDs.
- Future LLM regressions — having the structural normalization at persist boundary protects all downstream readers.

Layer 2 closes the specific CJM UX gap user is hitting.

### Edge cases for the preflight

- **No characters in script** → skip preflight entirely, go straight to bulk first_frames.
- **Character already has `dossier.reference_image`** → skip its preflight submit. Idempotent.
- **`generateCharacterDossierAction` returns `ok:false`** (quota/rate-limit) → skip that character; continue with others.
- **Preflight budget exceeded with partial completion** → proceed to bulk first_frames; partial visual consistency. Log which characters didn't complete.
- **Anon-user quota** — preflight + bulk first_frames together can hit the 50/day daily cap if user creates multiple drafts. Document the limit; UI message handles it via the existing `reserveMediaJob` `ok:false` path.

## Problem 2 — `isPending` clears at submit, not at fal completion (REVISED again after reading the actual modal code)

**Original spec's hypothesis was wrong.** `ProjectJobsPoller` at [apps/web/src/app/projects/[id]/page.tsx:98](apps/web/src/app/projects/[id]/page.tsx:98) already calls `router.refresh()` every 5s on successful poll tick AND on realtime terminal events ([ProjectJobsPoller.tsx:32,46-49](apps/web/src/components/workspace/ProjectJobsPoller.tsx:32)). So the RSC tree IS refreshing. The character prop passed to `CharacterModal` IS updating.

**Second hypothesis was also wrong.** The dossier image IS rendered inside the modal — [CharacterModal.tsx:27-40](apps/web/src/components/workspace/character/CharacterModal.tsx:27) wraps `<DossierImage>` in a conditional on `character.dossier`, with `key={character.dossier.generated_at}` for cache-bust on regen. `DossierImage` resolves a signed URL via `getDisplayUrl(storage, 'character-dossiers')`.

**Real root cause (verified by reading the code):** the "Сгенерировать досье" button uses `useTransition`'s `isPending` flag (see [CharacterModalClient.tsx:117-133](apps/web/src/components/workspace/character/CharacterModalClient.tsx:117) `handleGenerate`). `isPending` is set during the server-action call, which submits a fal job and returns within ~2-3 seconds — NOT after fal completes. The button label "Генерирую..." stops showing after that brief submit window. User reads "loading done = result ready", waits a moment, sees nothing change in the modal (dossier prop hasn't arrived yet — fal still processing), gives up, closes the modal.

When ProjectJobsPoller's next refresh (~5s later, then again ~10s, then realtime terminal at ~16-20s) finally lands the dossier in the prop, the modal IS gone (user closed it). Reopening the modal shows the by-now-arrived dossier.

So nothing is broken structurally — it's a feedback-window UX bug. The "loading" signal must persist until either the dossier landed OR the action errored.

**Proposed fix (per Codex round-1 Q5 answer):**

Track a local `isWaitingForDossier` boolean in `CharacterModalClient`:
1. On `handleGenerate` click: capture `lastSeenGeneratedAt = character.dossier?.generated_at ?? null`, set `isWaitingForDossier = true`.
2. Use `useEffect([character.dossier?.generated_at])` to clear the flag when the timestamp moves past the captured baseline (truthy AND different from baseline). Also clear on action error.
3. Button shows "Генерирую…" while `isPending || isWaitingForDossier`.
4. Add a small overlay or progress hint over the dossier-hero block ("Генерирую досье… ~20с") so the user has visible activity in the hero area while waiting.

The modal already re-renders correctly when the prop arrives — this fix just stops sending the false "done" signal early.

**No changes to `use-poll-jobs.ts` or `ProjectJobsPoller`.** No new dossier preview block needed — it already exists.

User flow:
1. User clicks "Сгенерировать досье" inside the modal → action submits → button stops loading.
2. Modal stays open. RSC refreshes ~5s later when poll completes the job. Card behind the modal updates with dossier image, but user can't see — modal covers it.
3. User closes modal → URL changes → modal unmounts → user finally sees the card with dossier image.

This is a UX feedback gap, not a refresh bug. The user has no visible signal that the dossier landed.

**Proposed fix:**

Add a dossier preview block inside `CharacterModalClient`, positioned at the top of the modal body (above the name input):

```tsx
{character.dossier?.storage && (
  <section className="char-modal-dossier-preview">
    <Image
      src={resolveDossierUrl(character.dossier.storage)}
      alt={`Досье ${character.name}`}
      width={dossierWidth} height={dossierHeight}
    />
    <span className="dossier-meta">
      {character.dossier.model} · {character.dossier.format} · {character.dossier.quality}
      {character.dossier.generated_at && ` · ${formatRelative(character.dossier.generated_at)}`}
    </span>
  </section>
)}
{!character.dossier?.storage && isPending && (
  <section className="char-modal-dossier-preview generating">
    <div className="spinner" />
    <span>Генерирую досье… ~20с</span>
  </section>
)}
```

`resolveDossierUrl(storage)` handles both `kind: 'fal_passthrough'` (direct URL) and `kind: 'supabase'` (via the new `/api/scene-asset?path=...` route from Problem 3 — but the dossier path lives under a `character-dossier` subfolder; need to verify the bucket and path scheme).

When ProjectJobsPoller's `router.refresh()` fires after dossier completion, the new `character` prop arrives → `character.dossier.storage` truthy → preview img renders. User sees the result without closing the modal.

**Per Codex round-1 SHOULD-FIX**, also consider adding a `key={character.dossier?.generated_at ?? 'no-dossier'}` to remount the modal's local state when the dossier changes. But the form fields (name/description/fullPrompt) shouldn't reset on dossier update — only when the character itself changes. Simpler: derive the preview image purely from props, leave local form state alone.

**No changes to `use-poll-jobs.ts`.** Codex round-1 was right that adding refresh there would be a duplicate band-aid.

## Problem 3 — `/api/scene-asset` route does not exist (latent bug)

**Code path:**

`apps/web/src/components/workspace/stages/scenes/SceneThumbnailColumn.tsx:30-34`:
```ts
function getAssetUrl(v: SceneAssetVersion): string | null {
  return v.storage.kind === 'fal_passthrough'
    ? v.storage.url
    : `/api/scene-asset?path=${encodeURIComponent(v.storage.path)}`;
}
```

When the asset's storage is `kind: 'supabase'`, the URL builds against `/api/scene-asset` — but there is no route at `apps/web/src/app/api/scene-asset/`. The browser GETs `/api/scene-asset?path=…` and Next.js returns 404. The `<img>` tag silently falls back to a broken-image style (the orange gradient in the user's screenshot is from CSS).

`git log --all -- apps/web/src/app/api/scene-asset/` returns nothing — the route was never created. The code at `SceneThumbnailColumn.tsx:33` is referencing planned-but-never-built infrastructure.

**Why this hasn't bitten before:**

Phase 1.3.5 (commit `0e94965`-ish) introduced an async mirror pipeline: a fire-and-forget job downloads fal CDN URL → uploads to Supabase Storage → updates the jsonb `storage` descriptor from `kind: 'fal_passthrough'` to `kind: 'supabase'`. Before the mirror completes (typically ~10s after the asset arrives), workspace renders the working fal_passthrough URL. After the mirror, the workspace switches to the broken `/api/scene-asset` URL.

- If a user generated and viewed an asset within ~10s of completion, they saw it.
- If they returned later (or refreshed after the mirror swap), they saw a broken image.

This affected workspace projects intermittently. PR #51 made it widely visible because CJM projects always end up with mirrored assets by the time the user reaches `/p/{slug}` → workspace.

**Proposed fix:**

Create the missing route `apps/web/src/app/api/scene-asset/route.ts`:

```ts
// GET /api/scene-asset?path=<user_id>/<project_id>/<scene_id>/<version_id>-frame.png
// Validates: current user owns the project (path prefix check), creates a 1h
// signed URL via service-role storage, 302-redirects to it.
```

Security:
1. Parse `path` from query.
2. Validate path matches the expected shape: `<uuid>/<uuid>/<scene_id>/<filename>` (regex).
3. Extract the leading `<user_id>` segment; assert `=== currentUser.id`.
4. (Defense in depth) Query `projects` table to confirm the project_id segment exists AND `user_id === currentUser.id`. RLS will refuse otherwise.
5. Create signed URL via `serviceRole.storage.from(SCENE_ASSETS_BUCKET).createSignedUrl(path, 3600)`.
6. Return 302 with `Location: <signed_url>`. Browser follows the redirect; img renders.

Cache: respond with `Cache-Control: private, max-age=3300` (just under the 1h signed-URL TTL) so the browser doesn't re-hit the route on every scroll.

Audit trail: log `path`, `user_id`, signed-URL success/failure. NO log of the signed URL itself (it's effectively a temporary credential).

Alternative considered + rejected: refactor `SceneThumbnailColumn` to use an inline signed URL fetched at server-component time, mirroring how `public-project-view.ts` does it. Rejected because (a) the workspace stages are deeply client-side with version switching, and inlining defeats client navigation; (b) the route-based approach is what the original code anticipated and is cleaner long-term (cacheable, swappable to CDN).

## Recovery (post-merge)

For the user's current project `282720fe-…`:
- After Problem 3 fix deploys, the existing first_frame_versions render correctly in workspace.
- For Problem 1 — the existing 4 first_frame_versions were generated WITHOUT character refs and look inconsistent. After Problem 1 fix, NEW projects will be correct. For this project specifically, user can regenerate each scene's first_frame in workspace (now that the dossier+ref_image exist).

For other affected users: same story — their script's `character_ids` will be corrected on next regen/refine, and they can re-generate first_frames manually. No automated bulk recovery proposed.

## Test plan

Unit:
- `link-scene-character-ids.ts` — 6+ cases: simple name swap, UUID passthrough, mixed (some names some UUIDs), orphan name (drop with log), case-insensitive match, empty character_ids.
- `/api/scene-asset` route — 4+ cases: unauth (302 to /login or 401), foreign user (403), valid (302 to signed URL), malformed path (400).
- `use-poll-jobs` character-completion refresh — assert `router.refresh()` fires only for `character_*` job kinds.

E2E (manual, post-deploy):
1. New project from landing → check `character_ids` contains UUIDs in the persisted script.
2. Storyboard scenes show consistent character across all 4 scenes.
3. Open workspace → all 4 first_frame thumbnails render (not broken images).
4. In workspace, click "Сгенерировать досье" → popup stays open → ~20s later popup updates to show dossier without manual close+reopen.

## Files touched (REVISED after Codex round-1)

| File | Change |
|---|---|
| `packages/core/src/llm/link-scene-character-ids.ts` (NEW) | Pure helper, returns `{scenes, warnings}`. Drops orphan names AND orphan UUIDs. |
| `packages/core/src/llm/link-scene-character-ids.test.ts` (NEW) | Unit tests: simple swap, UUID passthrough, mixed input, orphan-name drop, orphan-UUID drop, case-insensitive match, empty character_ids, two characters same name. |
| `packages/core/src/llm/index.ts` | Export helper |
| `apps/web/src/server/actions/scripts.ts` | Call helper in 3 generate/regen/refine functions; log warnings with `project_id`. |
| `apps/web/src/server/actions/scripts.test.ts` | **Integration-level test** (per Codex round-1 SHOULD-FIX): assert persisted script's scenes contain UUIDs after generate/refine actions. Mock LLM provider; verify the `update` payload to supabase. |
| `apps/web/src/server/lib/reconcile-character-preflight.ts` (NEW) | Mirror of `reconcile-first-frames.ts` shape: discriminated result, injected deps. Submits dossier jobs for chars missing `dossier.reference_image`, polls until terminal or 90s budget. |
| `apps/web/src/server/lib/reconcile-character-preflight.test.ts` (NEW) | 8+ cases following `reconcile-first-frames.test.ts` pattern. |
| `apps/web/src/server/actions/projects.ts` | Call `reconcileCharacterPreflight` in CJM after()-flow between `generateScriptAction` and `generateAllFirstFramesAction`. |
| `apps/web/src/app/api/scene-asset/route.ts` (NEW) | Signed-URL proxy. `Cache-Control: private, max-age=3300` on 2xx, `no-store` on 4xx/5xx. |
| `apps/web/src/app/api/scene-asset/route.test.ts` (NEW) | unauth (302/401), foreign user (403), valid path (302), malformed path (400), unknown storage error (500 + no-store). |
| `apps/web/src/components/workspace/character/CharacterModalClient.tsx` | Render dossier preview block at top (image when `character.dossier.storage` truthy; generating-state spinner when isPending and no dossier yet). |

Estimated diff: ~450-600 LOC including tests (up from 250-350 — preflight + modal preview are non-trivial additions).

## Open questions for Codex round-2

1. **Preflight budget interaction with the existing first_frame reconcile budget.** Both run inside the same `after()` callback (300s total). Preflight takes ~50s in the typical case (dossier ~25s + reference_image chained ~25s) and the existing first_frame reconcile takes ~30-60s. Plus script-gen ~30s. Headroom is comfortable for 1-2 characters but starts squeezing for projects with 3+ characters (~150s+). Should preflight have its own configurable budget (default 90s)? Or should I share a single combined `AFTER_BUDGET = 240s` and bail early if any phase eats too much?

2. **Preflight skip rule.** A character may have `dossier.storage` (text+image landed) but `!dossier.reference_image` (chain failed mid-way). My current rule: trigger only when EITHER is missing. Alternative: also re-trigger when `dossier.generated_at` is older than X hours (stale recovery). I lean: keep the simple "missing" rule, leave stale recovery to a future operator script.

3. **Preflight error → status='error' or proceed.** If `reconcileCharacterPreflight` returns `budget_exceeded`, the spec proposes proceeding to bulk first_frames anyway (partial consistency). But should it instead flip to `status='error'` immediately so the user sees the recovery view + retry CTA, exactly like the first_frame reconcile timeout already does? Tradeoff: speed vs. honesty about the failure.

4. **Dossier preview image: render via `<Image>` (Next.js) or plain `<img>`?** Next/Image needs `unoptimized` for signed URLs or remote pattern whitelisting. The character grid already renders dossier images via some pattern — should I mirror that exactly, or is a fresh approach worth taking?

5. **Generating-state spinner inside the modal.** When user clicks "Сгенерировать досье" and `character.dossier` is still null on next render, my spec shows a spinner inline. But the workspace-level `ProjectJobsPoller` updates the prop within ~5s — the spinner-then-image transition happens via prop changes, not local state. Is that the right UX, or should I track a local `isWaitingForDossier` flag for tighter transitions?

6. **Storage path scheme for character_dossier vs scene-asset.** `/api/scene-asset` is named after the bucket "scene-assets". Character dossier images live in… need to check. If a separate bucket, the new route needs to handle both buckets (or be two routes). Please flag if you spot the right paths in the codebase.

7. **Test for `scripts.test.ts` integration assertion.** The existing tests heavily mock supabase. For "scenes contain UUIDs after persist" I need to assert on the `update({script: ...})` call's payload. Is the mock pattern in `pollMediaJobsAction.test.ts` (capturing the supabase mock's `update.mock.calls[0][0]`) the right template?

Return BLOCKERS / SHOULD-FIX / NITS / READY-TO-IMPLEMENT verdict on the revised spec.
