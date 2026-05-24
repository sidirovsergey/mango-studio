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

1. **`Stage04Provider` → `ScriptStateProvider`** — renamed. The provider already held the full script (not just Stage 04 scenes); the rename makes that honest. New file location: `apps/web/src/components/workspace/ScriptStateProvider.tsx`. Existing file at `stages/scenes/Stage04Provider.tsx` is deleted; `Stage04Script` and `SceneView` types move to the new file. `useStage04()` → `useScriptState()` via codemod (full target list in §12).

2. **Provider scope — narrow lift**: `ScriptStateProvider` lives *inside* `<main className="workspace-shell">`, wrapping only `<TelemetryHeader />` + `<WorkspaceScroll>`. NOT around `<Chat>` or `<TopBar>` — they don't read script/jobs state and would re-render unnecessarily on every poll tick.

3. **Header is a sibling of `TopBar` in the shell flex column.** `.workspace-shell` is `display: flex; flex-direction: column; overflow: hidden`; `.workspace-scroll` is the inner scroll container with `overflow-y: auto`. The header sits as a normal flex row between `TopBar` (64px) and the scroll area. It does NOT need `position: sticky` — the layout already pins it. `z-index` is only needed if a future overlay competes (deferred — `.topbar` currently has no `position` or `z-index`).

4. **Phase derivation is pure-function client-side** — `derivePipelinePhase(scenes, jobs, masterActiveId)` returns a discriminated union. No new server schema, no new RPC.

5. **Bug 1 fix lives in `ScriptStateProvider`** — `useEffect` syncs `script` from `initialScript` on prop change. Same for `jobs` (RSC-authoritative semantics — see §5 for the corrected handling that closes the stale-pending hole).

6. **Bug 2 fix lives in `page.tsx`** — single query expansion + post-fetch split into `characterJobs` (for StageCharacters) and `sceneJobs` (for ScriptStateProvider). Limit raised 50 → 200 to absorb retries. Narrow column projection (see §6) — `.select('*')` exposes internal `request_input`/`fal_request_id`/`model`/`result_storage` fields that the client never reads.

7. **`scrollToFinal()` extracted** — from inline in `Stage04Inline.tsx` to `apps/web/src/lib/scroll-to-final.ts`. Shared by `Stage04Inline` (existing call site) and `TelemetryHeader` (new Phase 3b «показать» button). Helper honors `prefers-reduced-motion`.

8. **Light cream Mango theme.** Workspace is on `--mango-*` / `--ink-*` / `--leaf-*` CSS variables (cream backgrounds, dark warm text). Header CSS uses the existing palette — NOT dark `#1a1a1d` from early visual mocks. See §8.3 for the rewritten light-themed stylesheet.

---

## 5 · Bug 1 patch — `ScriptStateProvider`

After rename + lift, add two effects.

### 5.1 Script sync (straightforward)

```ts
useEffect(() => {
  setScript(initialScript);
}, [initialScript]);
```

Safe because both sources (RSC `initialScript` prop, realtime `setScript`) read the same `projects.script` row.

### 5.2 Jobs sync — RSC-authoritative with bounded realtime grace

**Naïve merge is unsafe.** A first-pass design merged `initialJobs` with `prev` keeping any prev row not in the new snapshot. That preserves stale rows forever if the terminal-status realtime cleanup is missed: pending job X transitions to completed → drops out of `initialJobs` (filter is inflight-only) → merge keeps the stale pending copy → UI shows spinner over a scene that's actually done.

**Corrected approach: trust RSC, keep realtime-only rows only for a brief grace window, and prune anything contradicted by the fresh script.**

```ts
const REALTIME_GRACE_MS = 5_000;

useEffect(() => {
  setJobs((prev) => {
    const now = Date.now();
    const byId = new Map<string, MediaJobRow>();

    // 1. RSC fetch is authoritative for any job it returns
    for (const j of initialJobs) byId.set(j.id, j);

    // 2. Keep realtime-only rows only if they're very fresh (< 5s old)
    //    AND not contradicted by the new initialScript (scene already done)
    for (const j of prev) {
      if (byId.has(j.id)) continue;
      const createdMs = j.created_at ? new Date(j.created_at).getTime() : 0;
      if (now - createdMs > REALTIME_GRACE_MS) continue;
      if (isContradictedByScript(j, initialScript)) continue;
      byId.set(j.id, j);
    }
    return Array.from(byId.values());
  });
}, [initialJobs, initialScript]);

/** True when the fresh script proves this inflight row is obsolete. */
function isContradictedByScript(
  job: MediaJobRow,
  script: Stage04Script | null,
): boolean {
  if (!script || !job.scene_id) return false;
  const scene = script.scenes.find((s) => s.scene_id === job.scene_id);
  if (!scene) return true;          // scene deleted → drop its jobs
  if (job.kind === 'video' && scene.video_active_version_id) return true;
  if ((job.kind === 'first_frame' || job.kind === 'scene_first_frame') &&
      scene.first_frame_active_version_id) return true;
  if (job.kind === 'voice' && scene.voice_audio_active_version_id) return true;
  if (job.kind === 'final_clip' && scene.final_clip) return true;
  if (job.kind === 'master_clip' && script.master_clip_active_version_id) return true;
  return false;
}
```

**Why this works:**
- A completed job that the realtime cleanup forgot to remove will be: (a) absent from `initialJobs` (terminal filter), (b) older than the 5s grace OR (c) contradicted by `initialScript` showing the active version landed. Two independent escape hatches.
- A genuinely fresh realtime-only `pending` row (Postgres committed → Postgrest not yet refetched) is < 5s old, not contradicted → kept. UI doesn't flicker.
- Deleted scenes' jobs are pruned (the contradiction check catches `scene === undefined`).

**Tests this design must pass:**
- `t1`: realtime pushed pending, RSC fetch includes same row pending → result has 1 copy
- `t2`: realtime pushed pending 10s ago, RSC fetch returns `[]`, script shows scene completed → row pruned (stale)
- `t3`: realtime pushed pending 2s ago, RSC fetch returns `[]`, script doesn't show completion → row kept (grace)
- `t4`: realtime pushed pending 2s ago for scene_id `S99`, RSC script doesn't contain `S99` → row pruned (deleted scene)
- `t5`: simultaneous arrival — `initialJobs` and `prev` both have row X, RSC version newer → RSC version wins

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
+      // Narrow projection — UI never reads request_input / fal_request_id /
+      // model / result_storage / cost_usd. Keep them server-side only.
+      .select(
+        'id, project_id, scene_id, character_id, kind, status, error_code, ' +
+          'created_at, updated_at, retry_count, delayed_until',
+      )
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

`characterJobs` is mapped to `CharacterJobSummary[]` (a narrower subset). `sceneJobs` is **already `MediaJobUiRow[]`** because the SELECT only requests those columns — no further narrowing needed before passing to `<Workspace initialJobs={sceneJobs}>`.

**Narrow type for client state:**

```ts
// apps/web/src/components/workspace/ScriptStateProvider.tsx
import type { Database } from '@mango/db';

type FullMediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

/**
 * Narrow projection used everywhere on the client. Mirror of the SELECT
 * in page.tsx and the realtime subscription. Keeps internal fields
 * (request_input, fal_request_id, model, result_storage, cost_usd) on the
 * server.
 */
export type MediaJobUiRow = Pick<
  FullMediaJobRow,
  | 'id'
  | 'project_id'
  | 'scene_id'
  | 'character_id'
  | 'kind'
  | 'status'
  | 'error_code'
  | 'created_at'
  | 'updated_at'
  | 'retry_count'
  | 'delayed_until'
>;
```

`ScriptStateProvider.initialJobs`, the `useScriptState().jobs` array, `upsertJob` / `removeJob` signatures, and `derivePipelinePhase` all switch from `MediaJobRow` to `MediaJobUiRow`. **Realtime callback in `use-poll-jobs.ts` must project the incoming payload to `MediaJobUiRow`** before calling `upsertJob` so the state shape stays consistent. This is a one-line `pickJobUiFields(row)` helper added next to the helper module.

If a future column is added that the UI needs (e.g., a new error category), add it to BOTH the SQL projection AND the `MediaJobUiRow` type AND the realtime helper in the same commit.

---

## 7 · `Workspace.tsx` restructure

### 7.1 Prop changes (explicit)

```ts
interface WorkspaceProps {
  project: ProjectRow;
  initialChatMessages: ChatMessageRow[];
  initialJobs: MediaJobUiRow[];                  // ← NEW
  charactersSlot: React.ReactNode;
  userEmail: string | null;
  isAnonymous: boolean;
}
```

`page.tsx` passes `initialJobs={sceneJobs}` when rendering `<Workspace ...>` (see §6 split).

### 7.2 Tree (Provider scoped narrowly)

`ScriptStateProvider` wraps ONLY `<TelemetryHeader />` + `<WorkspaceScroll>` — not `<Chat>`, not `<TopBar>`. Chat and TopBar don't read script/jobs state and should not re-render on every poll tick.

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
            <ScriptStateProvider
              projectId={project.id}
              initialScript={(script as unknown as Stage04Script) ?? null}
              initialJobs={initialJobs}
            >
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
            </ScriptStateProvider>
          </main>
        </div>
      </InsufficientBalanceProvider>
    </TierGateProvider>
  );
}
```

### 7.3 `page.tsx` Workspace invocation

```diff
       <Workspace
         project={project}
         initialChatMessages={messagesResult.data ?? []}
+        initialJobs={sceneJobs}
         charactersSlot={charactersSlot}
         userEmail={user.email ?? null}
         isAnonymous={Boolean(user.is_anonymous)}
       />
```

---

## 8 · `TelemetryHeader` — new component

### 8.1 Phase model

```ts
// apps/web/src/components/workspace/derivePipelinePhase.ts
import type { SceneView, Stage04Script } from './ScriptStateProvider';
import type { MediaJobUiRow } from './ScriptStateProvider';

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

type SceneStatus = 'done' | 'running' | 'queued' | 'error';

/**
 * Choose the most-relevant single job for a scene from the candidates.
 * Priority: inflight > error > anything else (queued / completed / cancelled).
 * Within a priority bucket, prefer the newest `created_at`.
 *
 * Why: `jobs` can contain stale completed rows that slipped past the grace
 * window, or a sequence of retries with same scene_id + same kind. We need
 * a deterministic choice, not "whatever `Array.find` returns first".
 */
function pickBestJob(candidates: MediaJobUiRow[]): MediaJobUiRow | null {
  if (candidates.length === 0) return null;
  const score = (j: MediaJobUiRow) =>
    INFLIGHT_STATUSES.has(j.status) ? 2 : j.status === 'error' ? 1 : 0;
  const ts = (j: MediaJobUiRow) => (j.created_at ? new Date(j.created_at).getTime() : 0);
  return candidates.slice().sort((a, b) => {
    const ds = score(b) - score(a);
    return ds !== 0 ? ds : ts(b) - ts(a);
  })[0] ?? null;
}

export function derivePipelinePhase(
  scenes: SceneView[],
  jobs: MediaJobUiRow[],
  masterActiveId: string | null,
): PipelinePhase {
  if (scenes.length === 0) return { kind: 'idle' };

  const sceneIds = new Set(scenes.map((s) => s.scene_id));

  // Scope jobs to scenes that currently exist in the script. Jobs for
  // deleted scenes never count.
  const sceneScopedJobs = jobs.filter(
    (j) => j.scene_id && sceneIds.has(j.scene_id) && SCENE_KINDS.has(j.kind),
  );

  const masterInflight = jobs.some(
    (j) => j.kind === 'master_clip' && INFLIGHT_STATUSES.has(j.status),
  );
  const sceneInflight = sceneScopedJobs.some((j) => INFLIGHT_STATUSES.has(j.status));

  const sceneStatuses: SceneStatus[] = scenes.map((s) => {
    if (s.video_active_version_id) return 'done';
    const candidates = sceneScopedJobs.filter((j) => j.scene_id === s.scene_id);
    const best = pickBestJob(candidates);
    if (!best) return 'queued';
    if (INFLIGHT_STATUSES.has(best.status)) return 'running';
    if (best.status === 'error') return 'error';
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

**Why scene-id scoping matters:** without it, a stale `video` job for a deleted scene keeps the header in `rendering` indefinitely. The user sees `0/3 готово` (script now has 3 scenes) but the header refuses to clear.

**Why `pickBestJob` instead of `Array.find`:** RSC returns rows ordered by `created_at desc`, realtime upserts append in arrival order. If a scene has both a stale completed job and a new pending job in the array, `Array.find` may return either depending on source. `pickBestJob` deterministically prefers inflight, falls back to error, then newest.

### 8.2 Component

Two refs guard correctness:
- `prevPhaseRef` — last observed phase kind (to detect transitions).
- `masterIdAtFinalizeStartRef` — `master_clip_active_version_id` snapshot at the moment phase entered `finalizing`. Phase 3b fires ONLY if the live id has CHANGED since that snapshot (i.e., a new master version landed). Otherwise we just transitioned `finalizing → idle` because the job errored without producing a new version — that's not "готово".

Copy uses generic `готово` (no "видео" noun) because a `rendering` phase can be triggered by `first_frame` jobs alone.

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
  const masterActiveId = script?.master_clip_active_version_id ?? null;
  const phase = useMemo(
    () => derivePipelinePhase(script?.scenes ?? [], jobs, masterActiveId),
    [script, jobs, masterActiveId],
  );

  const [justFinished, setJustFinished] = useState(false);
  const prevPhaseRef = useRef(phase.kind);
  const masterIdAtFinalizeStartRef = useRef<string | null>(masterActiveId);

  useEffect(() => {
    // Snapshot the active master id at the moment we ENTER finalizing
    if (prevPhaseRef.current !== 'finalizing' && phase.kind === 'finalizing') {
      masterIdAtFinalizeStartRef.current = masterActiveId;
    }

    // Phase 3b: finalizing → idle AND a NEW master id landed (success).
    // Without the id-change check, a failed second finalize (job → error,
    // active id unchanged) would falsely flash "✓ готово".
    if (
      prevPhaseRef.current === 'finalizing' &&
      phase.kind === 'idle' &&
      masterActiveId &&
      masterActiveId !== masterIdAtFinalizeStartRef.current
    ) {
      setJustFinished(true);
      const t = setTimeout(() => setJustFinished(false), JUST_FINISHED_WINDOW_MS);
      prevPhaseRef.current = phase.kind;
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = phase.kind;
  }, [phase.kind, masterActiveId]);

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
          {phase.doneCount} / {phase.totalCount} готово
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

Uses the existing **light cream Mango palette** (`--mango-*`, `--ink-*`, `--leaf-*` CSS vars defined elsewhere in the design system) — NOT a dark theme. Harmonizes with `.topbar` (cream `rgba(255, 252, 246, 0.92)`) and `.scene-row` (white `rgba(255, 255, 255, 0.88)`). No `position: sticky` — the header is a regular flex row in `.workspace-shell` (flex column, scroll container is `.workspace-scroll` *below* the header). No `z-index` — nothing currently competes.

```css
.telemetry-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 22px;
  background: linear-gradient(90deg,
    rgba(255, 246, 226, 0.92) 0%,
    rgba(255, 252, 246, 0.92) 100%);
  border-bottom: 1px solid rgba(26, 18, 7, 0.06);
  font-family: 'Manrope', system-ui, sans-serif;
  color: var(--ink-700, #4A3520);
  flex: 0 0 auto;
}

.telemetry-num {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--ink-900, #1A1207);
  min-width: 96px;
}
.telemetry-num.done { color: var(--leaf-500, #069150); }

.telemetry-prog {
  flex: 1;
  height: 4px;
  background: rgba(26, 18, 7, 0.06);
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
  background: linear-gradient(90deg,
    transparent,
    var(--mango-500, #F57600),
    transparent);
  animation: telemetry-flow 2.4s linear infinite;
}
.telemetry-prog-flow-fast::after {
  background: linear-gradient(90deg,
    transparent,
    var(--mango-600, #D85F00),
    transparent);
  animation: telemetry-flow 1.4s linear infinite;
}
.telemetry-prog-done {
  background: linear-gradient(90deg,
    rgba(6, 145, 80, 0.18),
    rgba(6, 145, 80, 0.32));
}

@keyframes telemetry-flow {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(285%); }
}

.telemetry-status {
  font-size: 12px;
  color: var(--ink-500, #7A6448);
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
  background: rgba(26, 18, 7, 0.12);
}
.telemetry-dot-done    { background: var(--leaf-500, #069150); }
.telemetry-dot-running { background: var(--mango-500, #F57600); animation: telemetry-pulse 1s ease-in-out infinite; }
.telemetry-dot-error   { background: #C84A2A; }
/* telemetry-dot-queued keeps default neutral fill */

@keyframes telemetry-pulse {
  50% { opacity: 0.55; }
}

.telemetry-finalize-icon {
  font-size: 14px;
  color: var(--mango-600, #D85F00);
}

.telemetry-show-link {
  background: transparent;
  border: none;
  color: var(--mango-600, #D85F00);
  text-decoration: underline;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
}
.telemetry-show-link:hover { color: var(--mango-700, #B14E00); }
.telemetry-show-link:focus-visible {
  outline: 2px solid var(--mango-500, #F57600);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .telemetry-status { display: none; }
  .telemetry-num { min-width: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .telemetry-prog-flow::after,
  .telemetry-prog-flow-fast::after { animation: none; opacity: 0.55; }
  .telemetry-dot-running { animation: none; }
}
```

**Palette discipline:** if any CSS var fallback above is wrong (haven't grepped exact values from `:root`), update before implementation. Implementation step: `grep -r '\-\-mango-500\|\-\-ink-700\|\-\-leaf-500' apps/web/src/styles/` to confirm the real values, then drop the literal fallbacks in `var(..., #xxxxxx)` calls if the vars are guaranteed defined.

---

## 9 · `SceneCard` polish — minimal

Two surgical changes in `apps/web/src/components/workspace/stages/scenes/SceneThumbnailColumn.tsx`:

1. **Done badge** (only when no inflight job AND a video version is active):
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

**No shimmer overlay on `.thumb-loading`.** An early design proposed a shimmer keyframe for the loading background. The existing `.thumb-loading` already has a deliberate composition: a radial mango-glow over a dark warm scrim (`rgba(245, 118, 0, 0.18)` radial + `rgba(26, 18, 7, 0.70→0.88)` linear). A shimmer overlay would either fight the gradient or replace the design language. The spinner + label («Видео» / «Кадр» / «Голос» / «Сборка») + sub-line («обычно 30–90 сек») already telegraph "work in progress". With Bug 1+2 fixed, the loading state will actually appear when expected — that's the primary win.

CSS additions in `apps/web/src/styles/storyboard-inline.css`:

```css
.badge.done {
  background: rgba(6, 145, 80, 0.14);
  color: var(--leaf-500, #069150);
  border: 1px solid rgba(6, 145, 80, 0.32);
}
```

(One rule. The existing `.badge` base class handles size, padding, position.)

Nothing else in `SceneCard` / `SceneSidePanel` / mode toggle / versions strip / thumb-loading / spinner / cancel changes.

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

Explicit target list (verified via `grep -r 'useStage04\|Stage04Provider' apps/`):

**File moves / new files:**
- `apps/web/src/components/workspace/stages/scenes/Stage04Provider.tsx` → **delete**
- `apps/web/src/components/workspace/ScriptStateProvider.tsx` → **new** (Provider + `useScriptState` hook + exported types `SceneView`, `Stage04Script`, `MediaJobUiRow`)
- `apps/web/src/components/workspace/TelemetryHeader.tsx` → **new**
- `apps/web/src/components/workspace/derivePipelinePhase.ts` → **new**
- `apps/web/src/lib/scroll-to-final.ts` → **new**
- `apps/web/src/styles/telemetry-header.css` → **new**

**Import / symbol updates (9 source files):**
- `apps/web/src/components/workspace/Workspace.tsx` — wraps tree with `<ScriptStateProvider>`, accepts `initialJobs` prop
- `apps/web/src/components/workspace/StageGate.tsx` — `useStage04` → `useScriptState`
- `apps/web/src/components/workspace/stages/StageFinal.tsx` — `useStage04` → `useScriptState` (Codex N2 — missed in v1 spec; verified in grep)
- `apps/web/src/components/workspace/stages/scenes/Stage04Inline.tsx` — `useStage04` → `useScriptState`; remove inline `scrollToFinal`, import from `@/lib/scroll-to-final`
- `apps/web/src/components/workspace/stages/scenes/SceneCard.tsx` — `SceneView` type import path
- `apps/web/src/components/workspace/stages/scenes/SceneSidePanel.tsx` — type imports
- `apps/web/src/components/workspace/stages/scenes/SceneThumbnailColumn.tsx` — `SceneView` type import path
- `apps/web/src/components/workspace/stages/scenes/PromptEditorModal.tsx` — type imports
- `apps/web/src/hooks/use-poll-jobs.ts` — absolute import `@/components/workspace/stages/scenes/Stage04Provider` → `@/components/workspace/ScriptStateProvider`; `useStage04()` → `useScriptState()`; **realtime callback projects full payload → `MediaJobUiRow` before `upsertJob`** (§6 narrow-type discipline)

**Barrel update:**
- `apps/web/src/components/workspace/stages/scenes/index.ts` — REMOVE re-exports of `Stage04Provider`, `useStage04`, `SceneView`, `Stage04Script`. Verify no external consumer imports these names from the barrel; if any, repoint to the new path.

**Doc / comment hygiene:**
- `apps/web/src/server/actions/buildProspectivePromptAction.ts` — JSDoc reference to "Stage04Provider" in a comment, update to "ScriptStateProvider".

**Naming policy:**
- `useStage04()` → `useScriptState()`
- `Stage04Provider` JSX → `ScriptStateProvider`
- **Keep `Stage04Script` type name** (provider rename is enough churn).
- `Stage04Inline` component name stays (it's about Stage 04 UI, not the provider).

**Test files:** any `*.test.ts(x)` importing these symbols updates in the same codemod pass — grep again after source files are migrated to catch any missed test mocks.

---

## 13 · Testing

### 13.1 Unit tests (new)

`derivePipelinePhase.test.ts` — minimum 14 cases:
1. empty scenes → `idle`
2. scenes present, 0 jobs, no master → `idle`
3. 1 `video` pending → `rendering` with `doneCount=0`
4. 2 scenes with `video_active_version_id` + 2 `video` running → `rendering`, `doneCount=2`
5. 1 `reserved` `scene_first_frame` → `rendering` (reserved is inflight)
6. `master_clip` pending → `finalizing` (precedence over rendering)
7. 1 `video` `error` → NOT rendering (error alone isn't inflight)
8. `master_clip` running + stray inflight scene job → `finalizing` (master wins)
9. Scope: job has `scene_id` not in current scenes → ignored (deleted scene)
10. Two `video` rows for the same scene (one stale completed, one new pending) → `pickBestJob` picks the inflight one → scene status `running`
11. Two `video` rows for the same scene (one stale completed, one new error) → picks error → status `error`
12. Newest-wins within the same priority bucket (two inflight rows different created_at) → newer wins (no observable diff in this test but keeps determinism)
13. `first_frame` job alone (no video) → `rendering`, `doneCount=0` — copy will say `0/N готово` (generic noun; see §8.2)
14. job has `scene_id=null` → ignored in scene scope (used by `character_dossier`/`master_clip`)

`scroll-to-final.test.ts`:
- SSR no-op (document undefined)
- missing `#finalStage` no-op
- smooth by default
- auto when `prefers-reduced-motion: reduce`

`pickJobUiFields.test.ts` (the realtime narrowing helper):
- input full `MediaJobRow` → output has exactly the `MediaJobUiRow` keys, internal fields stripped.

### 13.2 Component tests (new, React Testing Library)

`TelemetryHeader.test.tsx`:
- `idle` → renders `null`.
- `rendering` → counter `«N / M готово»`, flow class, soft status text, dots with correct per-scene classes.
- `finalizing` → counter `«M / M ✓»` with `done` class, fast flow, finalize icon.
- **Phase 3b success path** — script enters `finalizing` with `master_clip_active_version_id=v1`, then a new `v2` lands and finalize job goes terminal → transition fires Phase 3b for 6s then dismisses (fake timers).
- **Phase 3b false-positive guard (Codex B2)** — script has existing `master_clip_active_version_id=v1`, enters second `finalizing`, finalize job errors without producing a new version, phase returns to `idle`, active id still `v1` (unchanged from snapshot) → **NO Phase 3b**.
- Cold mount with master already ready (no `finalizing` transition observed) → no Phase 3b.
- Sequential finalize cycles (success, then another success) → Phase 3b shows on each cycle.
- «показать» click → calls `scrollToFinal` (mock) and immediately dismisses the header.
- `prefers-reduced-motion: reduce` → animation class disabled (assert via `getComputedStyle` or absence of keyframe class).
- `role="status"` and `aria-live="polite"` present on root.

`ScriptStateProvider.test.tsx`:
- **Bug 1** — rerender with new `initialScript` prop → context exposes the new script.
- **Bug 1 jobs (RSC-authoritative + grace + script-pruning, Codex B1):**
  - `t1` realtime pushed pending + RSC fetch contains same row pending → exactly 1 copy in state.
  - `t2` realtime pushed pending **10s ago**, RSC returns `[]`, script shows scene `video_active_version_id` set → row pruned (stale).
  - `t3` realtime pushed pending **2s ago**, RSC returns `[]`, script doesn't show completion → row kept (grace).
  - `t4` realtime pushed pending **2s ago** for `scene_id=S99`, RSC script has no `S99` → row pruned (deleted scene).
  - `t5` both `initialJobs` and `prev` have row X with different statuses → `initialJobs` wins.
- **Two-poller race (Codex SF5):**
  - `ProjectJobsPoller.router.refresh()` triggers an `initialScript`/`initialJobs` re-pass at the same tick as `usePollJobs` calls `setScript` directly. After both settle, state is the latest of the two — no flicker, no lost update.
  - Missed terminal realtime: realtime pushes `pending`, then never pushes the `completed` cleanup, but the next RSC fetch contains a fresh `initialScript` with the scene completed and `initialJobs=[]` → pending row gets pruned via the `isContradictedByScript` path.

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
| Jobs merge re-introduces stale `pending` row when realtime cleanup is missed | **Was Medium, now Low** | §5.2 RSC-authoritative + 5s grace + `isContradictedByScript` script-pruning; tests `t1`–`t5`. |
| Codemod misses one `useStage04` call site | Low | Pre-merge `typecheck` catches missing imports; §12 explicit target list grep-verified. |
| Header layout interferes with `TopBar` | Very low | Header is a flex sibling in `.workspace-shell`, not sticky/absolutely positioned. `.topbar` has no `position` or `z-index`. Verify visually in smoke. |
| Phase 3b false-positive on failed second finalize | **Was High, now Low** | §8.2 `masterIdAtFinalizeStartRef` — Phase 3b only fires when `master_clip_active_version_id` actually changed. Tested. |
| `derivePipelinePhase` non-deterministic on stale jobs in array | **Was Medium, now Low** | §8.1 `pickBestJob` priority sort + scene-id scoping. Tested. |
| `WorkspaceScroll` has its own scroll container ⇒ `scrollIntoView` scrolls wrong ancestor | Low | Browser walks up to nearest scrollable ancestor; `.workspace-scroll` is the only such ancestor. Verify in smoke. |
| Provider lift causes Chat re-renders on every job poll | **Was Medium, now mitigated** | §7.2 narrowed scope: provider wraps only `TelemetryHeader` + `WorkspaceScroll`, not Chat / TopBar. |
| Renaming `Stage04Provider` file breaks lazy-loaded chunks / cache | Very low | No dynamic imports observed; full build rehashes. |
| Light/dark theme mismatch in `.telemetry-header` | **Was Medium, now Low** | §8.3 rewritten in cream Mango palette using `--mango-*` / `--ink-*` / `--leaf-*`. Implementation step grep-checks actual CSS var values before merging. |
| `.thumb-loading` shimmer overwrites existing dark scrim + mango glow | **Closed (design dropped)** | §9 — shimmer removed from polish; existing scrim + spinner kept. |
| `.select('*')` exposes internal `request_input`/`fal_request_id`/`model`/`result_storage`/`cost_usd` to client | **Closed (design tightened)** | §6 narrow projection + `MediaJobUiRow` type + realtime callback narrowing. |

---

## 16 · Estimated diff size

- New files: 6 (`ScriptStateProvider.tsx`, `TelemetryHeader.tsx`, `derivePipelinePhase.ts`, `scroll-to-final.ts`, `telemetry-header.css`, `pickJobUiFields.ts`)
- Deleted files: 1 (`Stage04Provider.tsx` — content migrated)
- Modified files: ~14 (page.tsx, Workspace.tsx, Stage04Inline.tsx, SceneCard.tsx, SceneThumbnailColumn.tsx, SceneSidePanel.tsx, PromptEditorModal.tsx, StageFinal.tsx, StageGate.tsx, use-poll-jobs.ts, stages/scenes/index.ts barrel, buildProspectivePromptAction.ts doc, storyboard-inline.css, `.gitignore` for `.superpowers/`)
- New tests: 4 files, ~40 cases (derivePipelinePhase 14 + scroll-to-final 4 + pickJobUiFields 1 + TelemetryHeader 10 + ScriptStateProvider 11)
- LOC: roughly +750 / -180 net

Still within «single PR» discipline (project habit ≤ 30 files / ≤ 2000 LOC).

---

## 17 · Done definition

PR1 is shippable when:

- [ ] Both bugs fixed and covered by tests (Bug 1 RSC-authoritative jobs + Bug 2 query expansion + narrow projection).
- [ ] `TelemetryHeader` renders all four phases (idle, rendering, finalizing, just-finished) correctly with full unit + component coverage including: Phase 3b false-positive guard (master id unchanged after failed second finalize) and deterministic per-scene status via `pickBestJob`.
- [ ] `useStage04` → `useScriptState` codemod complete; all 334 prior tests still pass; ~40 new tests pass.
- [ ] `typecheck`, `lint`, `test` all green in CI.
- [ ] Vercel preview smoke (§ 13.6) passes end-to-end.
- [ ] User E2E in prod (§ 13.7) confirms «вижу прогресс».
- [ ] Memory updated: `project_pr1_workspace_render_dashboard_status.md` summarizing what shipped + invariants for next phases.

---

## 18 · Changelog

**v2 — 2026-05-24 — Codex review applied**

Codex (proxied through user, due to shared-runtime hang on auto-invocation) returned 3 BLOCKERS + 5 SHOULD-FIX + 3 NITS. All accepted + 2 self-found issues addressed:

- **B1 → §5.2** — naïve merge replaced with RSC-authoritative semantics + 5s realtime grace + `isContradictedByScript` script-based pruning. Adds tests `t1`–`t5`.
- **B2 → §8.2** — `masterIdAtFinalizeStartRef` guards Phase 3b against false positive when a second finalize errors without producing a new master version.
- **B3 → §8.1** — `derivePipelinePhase` now filters jobs to current scene_id set (drops deleted-scene noise) and uses `pickBestJob` (priority sort: inflight > error > terminal, newest-wins within bucket) instead of `Array.find`.
- **SF1 → §8.2 + §13** — header copy changed from «{done}/{total} видео» to «{done}/{total} готово» (generic noun) — first-frame-only jobs no longer misleadingly say "видео".
- **SF2 → §6** — `.select('*')` replaced with explicit column list; new `MediaJobUiRow` narrow type; realtime callback projects full payload to narrow shape before `upsertJob`.
- **SF3 → §7.2** — `ScriptStateProvider` lifted only inside `<main className="workspace-shell">`, wrapping `TelemetryHeader` + `WorkspaceScroll`. Chat + TopBar stay outside (no re-render storm).
- **SF4 → §7.1 + §7.3** — `WorkspaceProps.initialJobs: MediaJobUiRow[]` made explicit; `page.tsx` invocation diff added.
- **SF5 → §13.2** — two-poller race + missed-terminal-realtime cases added to `ScriptStateProvider.test.tsx`.
- **N1 → §4.2 + §15** — sticky/z-index claims about the header removed (`.topbar` has no `position`/`z-index`; header is a flex sibling in a non-scrolling shell).
- **N2 → §12** — `StageFinal.tsx` codemod target added (Codex caught the omission; grep verified).
- **N3 → §12** — codemod list now explicitly includes the barrel `stages/scenes/index.ts`, the absolute import in `use-poll-jobs.ts`, and the doc comment in `buildProspectivePromptAction.ts`.
- **X1 (self-found) → §8.3** — header CSS rewritten in light cream Mango palette (`--mango-*` / `--ink-*` / `--leaf-*`). Dark `#1a1a1d` palette from initial visual mocks dropped — workspace is light-themed.
- **X2 (self-found) → §9** — `.thumb-loading` shimmer dropped. Existing scrim (dark warm + radial mango glow) is intentional design; overwriting it would clash. Done badge + tooltip change kept.

Risk register (§15) updated to reflect mitigations. Estimated diff (§16) widened to account for new helper module + ~15 additional test cases.

**v1 — 2026-05-24 — initial draft**

Initial brainstorming output (6 sections, 2 bug fixes + new TelemetryHeader + scene polish). Committed as `b294947`.
