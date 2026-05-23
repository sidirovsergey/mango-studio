# PR1 Spec — Workspace Render Dashboard (Bug 1 + Bug 2 + TelemetryHeader)

**Date:** 2026-05-24
**Branch:** `feature/pr1-workspace-render-dashboard`
**Worktree:** `C:/mango-studio/.claude/worktrees/trusting-bohr-8336b0/`
**Base:** `origin/main` @ `c1adbef` (post PR #55)
**Phase context:** Closes UX trust gap reported 2026-05-23 after CJM payment redirect (`handoff_2026-05-23_workspace_ui_inflight.md`).
**Successor PRs:**
- PR2 — Codex hygiene follow-up on PR #55 (explicit `GRANT TO service_role`, atomic finalize RPC, ownership check, `WITH ORDINALITY`, real-UUID test)
- PR3 (deferred task) — character avatar uses dossier image as image-to-image reference

---

## 1 · Problem

User clicks «Собрать ролик за 210₽», ЮKassa mock confirms, redirect lands them back in workspace `/projects/{id}`. DB shows 4 `video` jobs enqueued (1 may already be completed). UI shows scene cards with the «Сгенерировать $0.50» button — as if no render was ever triggered. After 30+ seconds, sometimes scene 01 video appears; sometimes nothing visible changes.

User-facing symptom: «либо сломалось, либо неочевидно визуально». No trust signal that money was charged and work is in flight.

---

## 2 · Root causes (already traced in handoff)

### Bug 1 — `Stage04Provider` useState anti-pattern

`apps/web/src/components/workspace/stages/scenes/Stage04Provider.tsx:97`
```ts
const [script, setScript] = useState<Stage04Script | null>(initialScript);
```

`useState` only reads `initialScript` once on mount. `ProjectJobsPoller` triggers `router.refresh()` every ~5s, which re-renders `page.tsx` with a fresh `script` from DB and re-passes it as a prop to `Stage04Provider`. The provider ignores the new prop and keeps the stale local state. The only path to state update is `usePollJobs` → `setScript` on a realtime event — if subscribe misses an event, UI stays stale forever.

### Bug 2 — `page.tsx` initial jobs query is too narrow

`apps/web/src/app/projects/[id]/page.tsx:51-58` only fetches character-level jobs:
```ts
.in('kind', ['character_dossier', 'character_avatar'])
.in('status', ['reserved', 'pending', 'running', 'error'])
```

Scene-level jobs (`video`, `first_frame`, `scene_first_frame`, `voice`, `final_clip`, `master_clip`) are never fetched on initial RSC render. `Stage04Provider` receives `initialJobs = []`, so on mount `jobsByScene` map is empty, every scene's `activeJob === null`, every scene card shows the «Сгенерировать» CTA instead of «Генерируется». `usePollJobs` only catches realtime INSERT/UPDATE events fired *after* subscribe — pre-existing pending jobs remain invisible until they finish (and even then, only if Bug 1 happens to update via realtime).

---

## 3 · Goals & non-goals

### Goals

- **G1.** When a user lands on `/projects/{id}` with scene-level jobs already inflight, the UI immediately shows accurate per-scene generation state without requiring realtime events.
- **G2.** When `ProjectJobsPoller` triggers `router.refresh()`, the provider state reflects the freshly-fetched server data.
- **G3.** A globally-visible trust signal communicates the render pipeline phase from anywhere in the workspace (idle, rendering scenes, finalizing master, just-finished).
- **G4.** Visual language stays consistent with existing minimalist Mango aesthetic (no confetti, no audio, no over-styled controls).
- **G5.** No new server-side schema, no DB migrations, no new RPCs in this PR.

### Non-goals

- ETA computation (per-job or aggregate). No countdown timers.
- Cancel-all-render-in-progress button. Per-scene cancel button is kept as a recovery mechanism but is not promoted.
- Push notifications, browser tab title updates, or sound cues.
- Storybook, visual regression testing, or Playwright E2E.
- Cross-browser matrix beyond «works in Chromium + Safari».
- Character dossier→avatar image-to-image consistency (deferred to PR3).
- PR #55 Codex follow-up fixes (deferred to PR2).

---

## 4 · Architecture

### 4.1 Component topology (after PR1)

```
app/projects/[id]/page.tsx (RSC)
├─ supabase fetch: project + chat_messages
└─ supabase fetch: ALL inflight jobs (expanded)
   └─ split into characterJobs + sceneJobs
└─ <Workspace project initialChatMessages initialJobs=sceneJobs charactersSlot ...>
   └─ <ScriptStateProvider initialScript initialJobs>   ← renamed Stage04Provider, lifted
      └─ <TierGateProvider> → <InsufficientBalanceProvider>
         └─ <div class="app">
            ├─ <Chat>
            └─ <main class="workspace-shell">
               ├─ <TopBar>
               ├─ <TelemetryHeader>                     ← NEW — sticky-top, sibling TopBar
               └─ <WorkspaceScroll>
                  └─ <div class="workspace">
                     ├─ StageIdea
                     ├─ {charactersSlot}                ← StageCharacters with characterJobs
                     ├─ StageScript
                     ├─ StageScenes (uses useScriptState — was useStage04)
                     └─ StageFinal                      ← unchanged
```

### 4.2 Key decisions

1. **`Stage04Provider` → `ScriptStateProvider`** — renamed and lifted to wrap the whole workspace shell. The provider already held the full script (not just Stage 04 scenes); the rename makes that honest. New file location: `apps/web/src/components/workspace/ScriptStateProvider.tsx`. Existing file at `stages/scenes/Stage04Provider.tsx` is deleted; `Stage04Script` and `SceneView` types move to the new file. `useStage04()` → `useScriptState()` via codemod.

2. **Header is a sibling of `TopBar`**, not the first child of `WorkspaceScroll` — so it stays sticky relative to the shell and is not affected by the inner scroll container.

3. **Phase derivation is pure-function client-side** — `derivePipelinePhase(scenes, jobs, masterActiveId)` returns a discriminated union. No new server schema, no new RPC.

4. **Bug 1 fix lives in `ScriptStateProvider`** — `useEffect` syncs `script` from `initialScript` on prop change. Same for `jobs` (with merge semantics to preserve realtime-inserted-but-not-yet-fetched rows).

5. **Bug 2 fix lives in `page.tsx`** — single query expansion + post-fetch split into `characterJobs` (for StageCharacters) and `sceneJobs` (for ScriptStateProvider). Limit raised 50 → 200 to absorb retries.

6. **`scrollToFinal()` extracted** — from inline in `Stage04Inline.tsx` to `apps/web/src/lib/scroll-to-final.ts`. Shared by `Stage04Inline` (existing call site) and `TelemetryHeader` (new Phase 3b «показать» button). Helper honors `prefers-reduced-motion`.

---

## 5 · Bug 1 patch — `ScriptStateProvider`

After rename + lift, add two effects:

```ts
useEffect(() => {
  setScript(initialScript);
}, [initialScript]);

useEffect(() => {
  setJobs((prev) => {
    const byId = new Map<string, MediaJobRow>();
    for (const j of initialJobs) byId.set(j.id, j);
    // Keep local-only realtime rows that haven't surfaced in the server fetch yet
    for (const j of prev) {
      if (!byId.has(j.id)) byId.set(j.id, j);
    }
    return Array.from(byId.values());
  });
}, [initialJobs]);
```

Rationale for `jobs` merge (not replace): realtime `upsertJob` may insert a row that has not yet propagated to the next RSC fetch. A replace would erase it for one refresh cycle, causing a UI flicker. Merge by id keeps both sources consistent.

---

## 6 · Bug 2 patch — `page.tsx`

Replace the single `media_jobs` query:

```diff
-    supabase
-      .from('media_jobs')
-      .select('id, character_id, kind, status, error_code, created_at')
-      .eq('project_id', id)
-      .in('kind', ['character_dossier', 'character_avatar'])
-      .in('status', ['reserved', 'pending', 'running', 'error'])
-      .order('created_at', { ascending: false })
-      .limit(50),
+    supabase
+      .from('media_jobs')
+      .select('*')   // ScriptStateProvider needs full MediaJobRow shape (parity with realtime payload)
+      .eq('project_id', id)
+      .in('kind', [
+        'character_dossier',
+        'character_avatar',
+        'scene_first_frame',
+        'first_frame',
+        'video',
+        'voice',
+        'final_clip',
+        'master_clip',
+      ])
+      .in('status', ['reserved', 'pending', 'running', 'error'])
+      .order('created_at', { ascending: false })
+      .limit(200),
```

Then post-split before passing down:

```ts
const allInflightJobs = jobsResult.data ?? [];
const characterJobs = allInflightJobs.filter(
  (j) => j.kind === 'character_dossier' || j.kind === 'character_avatar',
);
const sceneJobs = allInflightJobs.filter(
  (j) => j.kind !== 'character_dossier' && j.kind !== 'character_avatar',
);
```

`characterJobs` is mapped to `CharacterJobSummary[]` (it's already a narrower subset of `MediaJobRow`). `sceneJobs` is `MediaJobRow[]` passed to `<Workspace initialJobs={sceneJobs}>`.

**Column projection note:** `.select('*')` matches the payload that realtime delivers via `usePollJobs`, so the client already sees the full row shape. If a future column is marked sensitive (e.g., provider tokens in `metadata`), narrow this projection AND the realtime subscription in parallel.

---

## 7 · `Workspace.tsx` restructure

```tsx
export function Workspace({
  project,
  initialChatMessages,
  initialJobs,
  charactersSlot,
  userEmail,
  isAnonymous,
}: WorkspaceProps) {
  const script = project.script as PersistedScript | null;
  const status = project.status;
  const hasReadyCharacter = (script?.characters ?? []).some((c) => c.dossier !== null);

  return (
    <ScriptStateProvider
      projectId={project.id}
      initialScript={(script as unknown as Stage04Script) ?? null}
      initialJobs={initialJobs}
    >
      <TierGateProvider>
        <InsufficientBalanceProvider>
          <div className="app" data-phase="workspace" style={{ opacity: 1, visibility: 'visible' }}>
            <Chat projectId={project.id} initialMessages={initialChatMessages} />
            <main className="workspace-shell">
              <TopBar
                projectId={project.id}
                autoMode={project.auto_mode}
                format={project.format as '9:16' | '16:9' | '1:1'}
                tier={project.tier as Tier}
                userEmail={userEmail}
                isAnonymous={isAnonymous}
              />
              <TelemetryHeader />
              <WorkspaceScroll>
                <div className="workspace">
                  <StageIdea project={project} />
                  {charactersSlot}
                  <StageScript project={project} script={script} />
                  <StageScenes
                    projectId={project.id}
                    projectStatus={status}
                    hasReadyCharacter={hasReadyCharacter}
                    tier={project.tier as Tier}
                  />
                  <StageFinal projectStatus={status} projectId={project.id} />
                </div>
              </WorkspaceScroll>
            </main>
          </div>
        </InsufficientBalanceProvider>
      </TierGateProvider>
    </ScriptStateProvider>
  );
}
```

---

## 8 · `TelemetryHeader` — new component

### 8.1 Phase model

```ts
// apps/web/src/components/workspace/derivePipelinePhase.ts
import type { SceneView } from './ScriptStateProvider';
import type { Database } from '@mango/db';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

export type PipelinePhase =
  | { kind: 'idle' }
  | {
      kind: 'rendering';
      doneCount: number;
      totalCount: number;
      sceneStatuses: Array<'done' | 'running' | 'queued' | 'error'>;
    }
  | {
      kind: 'finalizing';
      totalCount: number;
      sceneStatuses: Array<'done' | 'running' | 'queued' | 'error'>;
    };

const INFLIGHT_STATUSES = new Set(['reserved', 'pending', 'running']);
const SCENE_KINDS = new Set([
  'scene_first_frame',
  'first_frame',
  'video',
  'voice',
  'final_clip',
]);

export function derivePipelinePhase(
  scenes: SceneView[],
  jobs: MediaJobRow[],
  masterActiveId: string | null,
): PipelinePhase {
  if (scenes.length === 0) return { kind: 'idle' };

  const masterInflight = jobs.some(
    (j) => j.kind === 'master_clip' && INFLIGHT_STATUSES.has(j.status),
  );
  const sceneInflight = jobs.some(
    (j) => SCENE_KINDS.has(j.kind) && INFLIGHT_STATUSES.has(j.status),
  );

  const sceneStatuses = scenes.map((s): 'done' | 'running' | 'queued' | 'error' => {
    if (s.video_active_version_id) return 'done';
    const job = jobs.find(
      (j) => j.scene_id === s.scene_id && SCENE_KINDS.has(j.kind),
    );
    if (!job) return 'queued';
    if (INFLIGHT_STATUSES.has(job.status)) return 'running';
    if (job.status === 'error') return 'error';
    return 'queued';
  });
  const doneCount = sceneStatuses.filter((s) => s === 'done').length;
  const totalCount = scenes.length;

  if (masterInflight) {
    return { kind: 'finalizing', totalCount, sceneStatuses };
  }
  if (sceneInflight) {
    return { kind: 'rendering', doneCount, totalCount, sceneStatuses };
  }
  return { kind: 'idle' };
}
```

### 8.2 Component

```tsx
// apps/web/src/components/workspace/TelemetryHeader.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useScriptState } from './ScriptStateProvider';
import { scrollToFinal } from '@/lib/scroll-to-final';
import { derivePipelinePhase } from './derivePipelinePhase';
import '@/styles/telemetry-header.css';

const JUST_FINISHED_WINDOW_MS = 6_000;

export function TelemetryHeader() {
  const { script, jobs } = useScriptState();
  const phase = useMemo(
    () =>
      derivePipelinePhase(
        script?.scenes ?? [],
        jobs,
        script?.master_clip_active_version_id ?? null,
      ),
    [script, jobs],
  );

  const [justFinished, setJustFinished] = useState(false);
  const prevPhaseRef = useRef(phase.kind);

  useEffect(() => {
    if (
      prevPhaseRef.current === 'finalizing' &&
      phase.kind === 'idle' &&
      script?.master_clip_active_version_id
    ) {
      setJustFinished(true);
      const t = setTimeout(() => setJustFinished(false), JUST_FINISHED_WINDOW_MS);
      prevPhaseRef.current = phase.kind;
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = phase.kind;
  }, [phase.kind, script?.master_clip_active_version_id]);

  if (phase.kind === 'idle' && !justFinished) return null;

  if (justFinished) {
    return (
      <div className="telemetry-header telemetry-just-finished" role="status" aria-live="polite">
        <span className="telemetry-num done">✓ готово</span>
        <div className="telemetry-prog telemetry-prog-done" aria-hidden />
        <span className="telemetry-status">финальный ролик собран</span>
        <button
          type="button"
          className="telemetry-show-link"
          onClick={() => {
            scrollToFinal();
            setJustFinished(false);
          }}
          aria-label="Перейти к финальному ролику"
        >
          показать
        </button>
      </div>
    );
  }

  if (phase.kind === 'rendering') {
    return (
      <div className="telemetry-header" role="status" aria-live="polite">
        <span className="telemetry-num">
          {phase.doneCount} / {phase.totalCount} видео
        </span>
        <div className="telemetry-prog telemetry-prog-flow" aria-hidden />
        <span className="telemetry-status">продолжаю работу</span>
        <SceneDots statuses={phase.sceneStatuses} />
      </div>
    );
  }

  // phase.kind === 'finalizing'
  return (
    <div className="telemetry-header telemetry-finalizing" role="status" aria-live="polite">
      <span className="telemetry-num done">
        {phase.totalCount} / {phase.totalCount} ✓
      </span>
      <div className="telemetry-prog telemetry-prog-flow-fast" aria-hidden />
      <span className="telemetry-status">склеиваю финальный ролик</span>
      <SceneDots statuses={phase.sceneStatuses} />
      <span className="telemetry-finalize-icon" aria-hidden>
        ✦
      </span>
    </div>
  );
}

function SceneDots({ statuses }: { statuses: Array<'done' | 'running' | 'queued' | 'error'> }) {
  return (
    <div className="telemetry-dots" aria-hidden>
      {statuses.map((s, i) => (
        <div key={i} className={`telemetry-dot telemetry-dot-${s}`} />
      ))}
    </div>
  );
}
```

### 8.3 CSS — new file `apps/web/src/styles/telemetry-header.css`

```css
.telemetry-header {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 18px;
  background: linear-gradient(90deg, #1a1a1d 0%, #1c1c20 100%);
  border-bottom: 1px solid #2a2a2e;
  font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  color: #e8e8eb;
  transition: opacity 200ms ease-out;
}

.telemetry-num {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: #ddd;
  font-weight: 500;
  min-width: 100px;
}
.telemetry-num.done { color: #6dca78; }

.telemetry-prog {
  flex: 1;
  height: 4px;
  background: #2a2a2e;
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}
.telemetry-prog-flow::after,
.telemetry-prog-flow-fast::after {
  content: '';
  position: absolute;
  inset: 0;
  width: 35%;
  background: linear-gradient(90deg, transparent, #ff8a3d, transparent);
  animation: telemetry-flow 2.4s linear infinite;
}
.telemetry-prog-flow-fast::after {
  background: linear-gradient(90deg, transparent, #ffb066, transparent);
  animation: telemetry-flow 1.4s linear infinite;
}
.telemetry-prog-done {
  background: linear-gradient(90deg, #1f2a22, #2a3a2e);
}

@keyframes telemetry-flow {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(285%); }
}

.telemetry-status {
  font-size: 12px;
  color: #999;
  font-style: italic;
}

.telemetry-dots {
  display: flex;
  gap: 5px;
}
.telemetry-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2a2a2e;
}
.telemetry-dot-done    { background: #6dca78; }
.telemetry-dot-running { background: #ff8a3d; animation: telemetry-pulse 1s ease-in-out infinite; }
.telemetry-dot-error   { background: #d05050; }
/* telemetry-dot-queued keeps default neutral fill */

@keyframes telemetry-pulse {
  50% { opacity: 0.55; }
}

.telemetry-finalize-icon {
  font-size: 14px;
  color: #ffb066;
}

.telemetry-show-link {
  background: transparent;
  border: none;
  color: #ff8a3d;
  text-decoration: underline;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
}
.telemetry-show-link:hover { color: #ffb066; }
.telemetry-show-link:focus-visible { outline: 2px solid #ff8a3d; outline-offset: 2px; }

@media (max-width: 640px) {
  .telemetry-status { display: none; }
  .telemetry-num { min-width: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .telemetry-prog-flow::after,
  .telemetry-prog-flow-fast::after { animation: none; opacity: 0.6; }
  .telemetry-dot-running { animation: none; }
  .telemetry-header { transition: none; }
}
```

---

## 9 · `SceneCard` polish — minimal

Two surgical changes in `apps/web/src/components/workspace/stages/scenes/SceneThumbnailColumn.tsx`:

1. **Done badge**:
   ```tsx
   const doneBadge = !isActiveJob && scene.video_active_version_id !== null;
   ```
   Render inside existing `.thumb-badges`:
   ```tsx
   {doneBadge && (
     <span className="badge done" title="Видео сцены готово">✓</span>
   )}
   ```

2. **Cancel tooltip clarity** (1 attribute):
   ```diff
   -  title="Отменить fal job"
   +  title="Отменить — если fal ещё не списал, баланс вернётся"
   ```

**Per-scene cancel button stays.** `handleCancel` → `cancelMediaJobAction` is the rescue path for stuck jobs (refund-safe per PR #54). The «no cancel» decision applied only to the global header. Per-scene cancel keeps the existing behavior; only the tooltip wording changes.

CSS additions in `apps/web/src/styles/storyboard-inline.css`:

```css
.thumb-loading {
  background: linear-gradient(90deg, #1f1f23 0%, #2a2a2e 50%, #1f1f23 100%);
  background-size: 200% 100%;
  animation: thumb-shimmer 1.8s linear infinite;
}
@keyframes thumb-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .thumb-loading { animation: none; }
}

.badge.done {
  background: rgba(109, 202, 120, 0.18);
  color: #6dca78;
  border-color: rgba(109, 202, 120, 0.4);
}
```

Nothing else in `SceneCard` / `SceneSidePanel` / mode toggle / versions strip changes.

---

## 10 · `scrollToFinal` helper extraction

New file `apps/web/src/lib/scroll-to-final.ts`:

```ts
export function scrollToFinal() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('finalStage');
  if (!el) return;
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({
    behavior: prefersReduced ? 'auto' : 'smooth',
    block: 'start',
  });
}
```

`Stage04Inline.tsx` removes its local `scrollToFinal` function and imports from the new path. `TelemetryHeader` imports the same helper for its «показать» button.

---

## 11 · Scroll behavior matrix

| Trigger | Behavior |
|---|---|
| Mount workspace (with or without inflight jobs) | No auto-scroll. Sticky header is the signal. |
| Phase `idle → rendering` | No auto-scroll. |
| User clicks «Финализировать ролик» in Stage 04 toolbar | `scrollToFinal()` (existing in `Stage04Inline.handleMasterClick`, unchanged). |
| Phase `rendering → finalizing` (automatic) | No auto-scroll (it was already done by the click). |
| Phase `finalizing → just-finished` (master ready) | No auto-scroll. Header shows Phase 3b «✓ готово • показать». |
| User clicks «показать» in Phase 3b | `scrollToFinal()` + `setJustFinished(false)`. |

Principle: programmatic scrolls only when the user has explicitly initiated something. No unsolicited jumps.

---

## 12 · Codemod scope — `Stage04Provider` → `ScriptStateProvider`

Find-and-replace targets (grep at implementation time):

- `apps/web/src/components/workspace/stages/scenes/Stage04Provider.tsx` → delete (content moves)
- `apps/web/src/components/workspace/ScriptStateProvider.tsx` → new file (Provider + types)
- All `import { … } from './Stage04Provider'` (or relative variations) → update path + symbol names
- `useStage04()` → `useScriptState()`
- `Stage04Provider` JSX usage → `ScriptStateProvider`
- `Stage04Script` type — **keep the name** for minimum diff. Don't rename to `ScriptState`. (Provider rename + symbol rename is enough churn; type rename adds nothing.)
- Test files mirroring same imports

`Stage04Inline` component name stays (it's about Stage 04 UI, not the provider). Same for `Stage04Script` if rename adds churn — flag this during implementation, default to keeping the type name for minimum diff.

---

## 13 · Testing

### 13.1 Unit tests (new)

- `derivePipelinePhase.test.ts` — at least 9 branches: empty / 0 jobs+no master / 1 video pending / 2 done+2 running / reserved counts as inflight / master_clip takes precedence / error not inflight / queued vs running discrimination / status-by-scene mapping.
- `scroll-to-final.test.ts` — SSR no-op, missing `#finalStage` no-op, smooth by default, auto when reduced motion.

### 13.2 Component tests (new, React Testing Library)

- `TelemetryHeader.test.tsx`:
  - `idle` → renders nothing.
  - `rendering` → counter, flow class, status text, correct dots.
  - `finalizing` → counter with `done` class, fast flow, finalize icon.
  - `finalizing → idle + master ready` → shows Phase 3b for 6s then dismisses (fake timers).
  - cold mount with master already ready → no Phase 3b.
  - second finalize cycle re-shows Phase 3b.
  - «показать» click → calls `scrollToFinal` (mock) and immediately dismisses.
  - reduced-motion media query → animation class is suppressed or has `animation: none` (CSS asserted via `getComputedStyle` or class presence).
  - `role="status"` and `aria-live="polite"` on root.

- `ScriptStateProvider.test.tsx`:
  - Bug 1 — rerender with a new `initialScript` prop ⇒ context exposes the new script.
  - jobs merge — old realtime-only row survives a refresh; replaced row uses the new copy.

### 13.3 Existing tests must stay green

`useStage04` → `useScriptState` codemod will touch test imports. After codemod: `pnpm --filter @mango/web test` must show ≥ 334 prior passing + ≥ ~25 new = ~360 total.

### 13.4 Pre-merge gates

Run in order, all must be green:
1. `pnpm --filter @mango/web typecheck`
2. `pnpm turbo lint --filter=@mango/web`
3. `pnpm --filter @mango/web test`

### 13.5 No Codex pre-merge audit required for PR1

This PR is pure UI: components, CSS, derivation, query expansion. No RPC, no SECURITY DEFINER, no billing. The policy «pre-merge Codex audit for RPC/SECURITY DEFINER/billing» (set after PR #54) does not trigger. Codex post-merge audit is optional if time permits.

### 13.6 Live smoke on Vercel preview (mandatory before tagging)

1. Deploy `feature/pr1-workspace-render-dashboard` to a Vercel preview.
2. Log in as the test user (sufficient balance).
3. Create a fresh project end-to-end (Landing → idea → script → first_frames).
4. Click «Собрать ролик» (MOCK_YOOKASSA mode is on in preview env).
5. After redirect to workspace, verify:
   - Sticky `TelemetryHeader` is visible at the top of the shell.
   - Counter reads «N / 4 видео • продолжаю работу» matching DB state.
   - Per-scene `.thumb-loading` shimmers; spinner + label «Видео» visible.
   - Dots update as scenes complete.
   - All 4 done → user clicks «Финализировать» → scroll to Stage 05 + header switches to «4 / 4 ✓ • склеиваю финальный ролик».
   - Master ready → header switches to «✓ готово • показать»; click scrolls to player; header dismisses after 6s.

If any of those fail on preview, do not promote to prod.

### 13.7 User E2E in prod before tagging

After merge + Vercel deploy to prod, user runs the same flow against a real (or MOCK_YOOKASSA) project. Confirmation «вижу прогресс» is the green light to `git tag v1.X.X`. Any regression → hotfix PR before the tag.

---

## 14 · Out-of-scope items captured for follow-up

| Item | Source | Captured as |
|---|---|---|
| Explicit `GRANT EXECUTE ON fn_mirror_version_storage TO service_role` | Codex review on PR #55 (false-positive in Supabase, kept as hygiene) | PR2 |
| Atomic finalize RPC to close concurrent-poller lost-update window | Codex BLOCKER 2 on PR #55 | PR2 |
| Ownership check in `mirrorSceneAssetToStorage` | Codex SHOULD-FIX on PR #55 | PR2 |
| `WITH ORDINALITY` + `jsonb_agg(... ORDER BY ord)` in mirror RPC | Codex SHOULD-FIX | PR2 |
| RPC returns «matched version updated», not «project row existed» | Codex SHOULD-FIX | PR2 |
| Real UUID in mirror test (currently `'v1'`) | Codex NIT | PR2 |
| Character avatar should use dossier image as image-to-image reference | User report 2026-05-24 | PR3 (already spawned as separate task) |

---

## 15 · Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| `useState` → `useEffect` sync re-introduces stale data race | Low | Merge logic for jobs; tests cover both directions. |
| Codemod misses one `useStage04` call site | Low | Pre-merge `typecheck` would catch missing imports. |
| Sticky header overlaps `TopBar` z-index | Low | Header `z-index: 40`, TopBar typically `z-50` — header sits below TopBar visually; verify in smoke. |
| Phase 3b shows on cold mount because the realtime stream replays a master completion | Low | `prevPhaseRef` starts at first observed phase; only `finalizing → idle` triggers 3b. |
| `WorkspaceScroll` has its own scroll container ⇒ `scrollIntoView` scrolls wrong ancestor | Low | Browser walks up to nearest scrollable ancestor automatically; verify in smoke. |
| Renaming `Stage04Provider` file breaks lazy-loaded chunks / cache | Very low | No dynamic imports observed; full build will rehash. |

---

## 16 · Estimated diff size

- New files: 4 (`ScriptStateProvider.tsx`, `TelemetryHeader.tsx`, `derivePipelinePhase.ts`, `scroll-to-final.ts`, `telemetry-header.css`)
- Deleted files: 1 (`Stage04Provider.tsx` — content migrated)
- Modified files: ~12 (page.tsx, Workspace.tsx, Stage04Inline.tsx, SceneCard.tsx, SceneThumbnailColumn.tsx, SceneSidePanel.tsx, StageFinal.tsx, storyboard-inline.css, any tests referencing the renamed symbols, `.gitignore` for `.superpowers/`)
- New tests: 3 files, ~25 cases
- LOC: roughly +500 / -150 net

This stays within the «single PR» discipline (per project habit, PRs in this codebase have been ≤ 30 files / ≤ 2000 LOC).

---

## 17 · Done definition

PR1 is shippable when:

- [ ] Both bugs fixed and covered by tests (Bug 1 + Bug 2).
- [ ] `TelemetryHeader` renders all four phases (idle, rendering, finalizing, just-finished) correctly with full unit + component coverage.
- [ ] `useStage04` → `useScriptState` codemod complete; all 334 prior tests still pass; ~25 new tests pass.
- [ ] `typecheck`, `lint`, `test` all green in CI.
- [ ] Vercel preview smoke (§ 13.6) passes end-to-end.
- [ ] User E2E in prod (§ 13.7) confirms «вижу прогресс».
- [ ] Memory updated: `project_pr1_workspace_render_dashboard_status.md` summarizing what shipped + invariants for next phases.
