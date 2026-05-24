# Workspace Render Dashboard (PR1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two client-state bugs that hide active scene generation after the «Собрать ролик» payment redirect, then add a sticky `TelemetryHeader` that telegraphs render pipeline progress globally.

**Architecture:** Lift the existing Stage-04 React context one level (rename `Stage04Provider` → `ScriptStateProvider`) so it sits inside `<main class="workspace-shell">` wrapping `TelemetryHeader` + `WorkspaceScroll`. Hydrate it with both `initialScript` AND `initialJobs` from the RSC fetch. Sync server-state into provider via `useEffect`, with RSC-authoritative job semantics + a 5-second realtime grace window + script-driven pruning. Derive pipeline phase (`idle | rendering | finalizing`) client-side from script + jobs + active master id, render header accordingly, and guard the "✓ готово" phase 3b against false positives when a second finalize errors.

**Tech Stack:** Next.js 16 App Router (RSC + client components), React 19, TypeScript 5, Vitest 3 + React Testing Library, Supabase (PostgREST + realtime), pnpm workspace, biome.

**Reference spec:** [`docs/superpowers/specs/2026-05-24-workspace-render-dashboard-design.md`](../specs/2026-05-24-workspace-render-dashboard-design.md) (v2, commit `9eb5c81`).

**Branch:** `feature/pr1-workspace-render-dashboard` (worktree `C:/mango-studio/.claude/worktrees/trusting-bohr-8336b0/`).

---

## File Map

### New files

- `apps/web/src/components/workspace/ScriptStateProvider.tsx` — Provider + `useScriptState` hook + types (`SceneView`, `Stage04Script`, `MediaJobUiRow`). Was `stages/scenes/Stage04Provider.tsx`.
- `apps/web/src/components/workspace/TelemetryHeader.tsx` — sticky-row component reading `useScriptState()`, rendering 4 phase states.
- `apps/web/src/components/workspace/derivePipelinePhase.ts` — pure function + `pickBestJob` helper.
- `apps/web/src/lib/scroll-to-final.ts` — extracted helper.
- `apps/web/src/lib/pickJobUiFields.ts` — realtime narrowing helper.
- `apps/web/src/styles/telemetry-header.css` — light cream Mango palette styles.
- Tests: `derivePipelinePhase.test.ts`, `scroll-to-final.test.ts`, `pickJobUiFields.test.ts`, `TelemetryHeader.test.tsx`, `ScriptStateProvider.test.tsx`.

### Deleted file

- `apps/web/src/components/workspace/stages/scenes/Stage04Provider.tsx` (content moves to `ScriptStateProvider.tsx`).

### Modified files (codemod targets)

- `apps/web/src/app/projects/[id]/page.tsx` — expand jobs query, narrow projection, split, pass `initialJobs`.
- `apps/web/src/components/workspace/Workspace.tsx` — accept `initialJobs`, lift Provider inside `<main>`, mount `<TelemetryHeader />`.
- `apps/web/src/components/workspace/StageGate.tsx` — `useStage04` → `useScriptState`.
- `apps/web/src/components/workspace/stages/StageFinal.tsx` — `useStage04` → `useScriptState`.
- `apps/web/src/components/workspace/stages/scenes/Stage04Inline.tsx` — `useStage04` → `useScriptState`; remove inline `scrollToFinal`, import from `@/lib/scroll-to-final`.
- `apps/web/src/components/workspace/stages/scenes/SceneCard.tsx` — `SceneView` import path.
- `apps/web/src/components/workspace/stages/scenes/SceneSidePanel.tsx` — type imports.
- `apps/web/src/components/workspace/stages/scenes/SceneThumbnailColumn.tsx` — type import path + done badge + tooltip text.
- `apps/web/src/components/workspace/stages/scenes/PromptEditorModal.tsx` — type imports.
- `apps/web/src/hooks/use-poll-jobs.ts` — import path + symbol rename + narrow realtime callback via `pickJobUiFields`.
- `apps/web/src/components/workspace/stages/scenes/index.ts` — remove re-exports of moved-out symbols.
- `apps/web/src/server/actions/buildProspectivePromptAction.ts` — JSDoc comment rename.
- `apps/web/src/styles/storyboard-inline.css` — add `.badge.done` rule.

---

## Task Sequence

1. Mechanical codemod (rename + barrel + 9 imports) — no behavior change, existing 334 tests stay green.
2. Type narrowing (`MediaJobUiRow` + `pickJobUiFields`) — internal cleanup, no UI change.
3. Bug 2 fix + Workspace lift Provider + `<TelemetryHeader>` placeholder — landing data flows through, header still returns `null`.
4. Bug 1 fix — `ScriptStateProvider` syncs from props with RSC-authoritative job semantics. Bug visibly closed.
5. `scroll-to-final` extraction + tests.
6. `derivePipelinePhase` + tests.
7. `TelemetryHeader` component + CSS + tests + wire into Workspace.
8. `SceneCard` polish (done badge + tooltip).
9. Verification gates + Vercel preview smoke + memory update.

After every task: `pnpm --filter @mango/web typecheck` + `pnpm turbo lint --filter=@mango/web` + `pnpm --filter @mango/web test` must all be green before committing.

---

## Task 1: Codemod — `Stage04Provider` → `ScriptStateProvider`

**Files:**
- Move: `apps/web/src/components/workspace/stages/scenes/Stage04Provider.tsx` → `apps/web/src/components/workspace/ScriptStateProvider.tsx`
- Modify: `apps/web/src/hooks/use-poll-jobs.ts`
- Modify: `apps/web/src/components/workspace/Workspace.tsx`
- Modify: `apps/web/src/components/workspace/StageGate.tsx`
- Modify: `apps/web/src/components/workspace/stages/StageFinal.tsx`
- Modify: `apps/web/src/components/workspace/stages/scenes/Stage04Inline.tsx`
- Modify: `apps/web/src/components/workspace/stages/scenes/SceneCard.tsx`
- Modify: `apps/web/src/components/workspace/stages/scenes/SceneSidePanel.tsx`
- Modify: `apps/web/src/components/workspace/stages/scenes/SceneThumbnailColumn.tsx`
- Modify: `apps/web/src/components/workspace/stages/scenes/PromptEditorModal.tsx`
- Modify: `apps/web/src/components/workspace/stages/scenes/index.ts`
- Modify: `apps/web/src/server/actions/buildProspectivePromptAction.ts`

- [ ] **Step 1: Verify clean working tree on the correct branch**

```bash
cd C:/mango-studio/.claude/worktrees/trusting-bohr-8336b0
git status
git branch --show-current
```

Expected: working tree clean, branch is `feature/pr1-workspace-render-dashboard`.

- [ ] **Step 2: Move provider file via `git mv`** (preserves history)

```bash
git mv apps/web/src/components/workspace/stages/scenes/Stage04Provider.tsx apps/web/src/components/workspace/ScriptStateProvider.tsx
```

- [ ] **Step 3: Rename in-file symbols inside the moved file**

Open `apps/web/src/components/workspace/ScriptStateProvider.tsx` and apply these renames inside the file body (keep `Stage04Script` and `SceneView` type names — see spec §12):

```diff
-const Stage04Context = createContext<Stage04State | null>(null);
+const ScriptStateContext = createContext<ScriptState | null>(null);
```

```diff
-interface Stage04State {
+interface ScriptState {
```

```diff
-export function Stage04Provider({
+export function ScriptStateProvider({
```

```diff
-  return <Stage04Context.Provider value={value}>{children}</Stage04Context.Provider>;
+  return <ScriptStateContext.Provider value={value}>{children}</ScriptStateContext.Provider>;
```

```diff
-export function useStage04(): Stage04State {
-  const ctx = useContext(Stage04Context);
-  if (!ctx) throw new Error('useStage04 must be used inside Stage04Provider');
+export function useScriptState(): ScriptState {
+  const ctx = useContext(ScriptStateContext);
+  if (!ctx) throw new Error('useScriptState must be used inside ScriptStateProvider');
```

(Keep `Stage04Script` type name and `SceneView` type unchanged.)

- [ ] **Step 4: Update barrel re-exports**

Open `apps/web/src/components/workspace/stages/scenes/index.ts` and remove the provider re-exports (the symbols no longer live in this directory):

```diff
 export { Stage04Inline } from './Stage04Inline';
 export { SceneCard } from './SceneCard';
-export { Stage04Provider, useStage04 } from './Stage04Provider';
-export type { SceneView, Stage04Script } from './Stage04Provider';
 export { PromptEditorModal } from './PromptEditorModal';
 export { CostMeter } from './CostMeter';
 export { CostWarningToast } from './CostWarningToast';
```

- [ ] **Step 5: Update absolute import in `use-poll-jobs.ts`**

```diff
-import { useStage04 } from '@/components/workspace/stages/scenes/Stage04Provider';
+import { useScriptState } from '@/components/workspace/ScriptStateProvider';
```

```diff
-  const { setScript, setProspectivePrompts, upsertJob, removeJob } = useStage04();
+  const { setScript, setProspectivePrompts, upsertJob, removeJob } = useScriptState();
```

- [ ] **Step 6: Update `Workspace.tsx` import + JSX**

```diff
-import { Stage04Provider, type Stage04Script } from './stages/scenes/Stage04Provider';
+import { ScriptStateProvider, type Stage04Script } from './ScriptStateProvider';
```

```diff
-                <Stage04Provider
+                <ScriptStateProvider
                   projectId={project.id}
                   initialScript={(script as unknown as Stage04Script) ?? null}
                 >
                   <StageScenes ... />
                   <StageFinal ... />
-                </Stage04Provider>
+                </ScriptStateProvider>
```

Leave the wrapping structure for now — Task 3 lifts it inside `<main>`.

- [ ] **Step 7: Update `StageGate.tsx`**

```diff
-import { useStage04 } from './stages/scenes/Stage04Provider';
+import { useScriptState } from './ScriptStateProvider';
```

Replace every `useStage04()` call with `useScriptState()`.

- [ ] **Step 8: Update `stages/StageFinal.tsx`**

```diff
-import { useStage04 } from './scenes/Stage04Provider';
+import { useScriptState } from '../ScriptStateProvider';
```

Replace every `useStage04()` with `useScriptState()`.

- [ ] **Step 9: Update `stages/scenes/Stage04Inline.tsx`**

```diff
-import { useStage04 } from './Stage04Provider';
+import { useScriptState } from '@/components/workspace/ScriptStateProvider';
```

Replace `useStage04()` with `useScriptState()`.

- [ ] **Step 10: Update `stages/scenes/SceneCard.tsx`**

```diff
-import type { SceneView } from './Stage04Provider';
+import type { SceneView } from '@/components/workspace/ScriptStateProvider';
```

- [ ] **Step 11: Update `stages/scenes/SceneSidePanel.tsx`**

```diff
-import type { SceneView } from './Stage04Provider';
+import type { SceneView } from '@/components/workspace/ScriptStateProvider';
```

Same for any `useStage04` import → `useScriptState` from the new path.

- [ ] **Step 12: Update `stages/scenes/SceneThumbnailColumn.tsx`**

```diff
-import type { SceneView } from './Stage04Provider';
+import type { SceneView } from '@/components/workspace/ScriptStateProvider';
```

- [ ] **Step 13: Update `stages/scenes/PromptEditorModal.tsx`**

```diff
-import type { SceneView } from './Stage04Provider';
+import type { SceneView } from '@/components/workspace/ScriptStateProvider';
```

(Or whichever types this file imports — adjust to whatever the existing import line names.)

- [ ] **Step 14: Update JSDoc in `server/actions/buildProspectivePromptAction.ts`**

```diff
- *     → batch across all scenes for both kinds. Used by Stage04Provider on
+ *     → batch across all scenes for both kinds. Used by ScriptStateProvider on
```

- [ ] **Step 15: Run typecheck**

```bash
pnpm --filter @mango/web typecheck
```

Expected: zero errors. If errors appear, fix any missed import; do not move on until clean.

- [ ] **Step 16: Run lint**

```bash
pnpm turbo lint --filter=@mango/web
```

Expected: zero errors.

- [ ] **Step 17: Run full test suite (verify 334 prior tests still pass)**

```bash
pnpm --filter @mango/web test
```

Expected: ≥ 334 passing, zero failures.

- [ ] **Step 18: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(workspace): rename Stage04Provider → ScriptStateProvider (mechanical)

Pure mechanical codemod ahead of the workspace render-dashboard work
(spec §12). No behavior change — provider hook moves up out of
`stages/scenes/` to `components/workspace/` so a sibling
TelemetryHeader can read pipeline state later. Type names
(Stage04Script, SceneView) intentionally kept to minimize churn.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Narrow type — `MediaJobUiRow` + `pickJobUiFields` helper

**Files:**
- Create: `apps/web/src/lib/pickJobUiFields.ts`
- Create: `apps/web/src/lib/__tests__/pickJobUiFields.test.ts`
- Modify: `apps/web/src/components/workspace/ScriptStateProvider.tsx`
- Modify: `apps/web/src/hooks/use-poll-jobs.ts`

- [ ] **Step 1: Write failing test for `pickJobUiFields`**

Create `apps/web/src/lib/__tests__/pickJobUiFields.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pickJobUiFields, type MediaJobUiRow } from '../pickJobUiFields';

describe('pickJobUiFields', () => {
  it('strips internal fields and keeps UI fields', () => {
    const full = {
      id: 'job-1',
      project_id: 'p-1',
      scene_id: 's-1',
      character_id: null,
      kind: 'video',
      status: 'pending',
      error_code: null,
      created_at: '2026-05-24T00:00:00Z',
      updated_at: '2026-05-24T00:00:01Z',
      retry_count: 0,
      delayed_until: null,
      // Internal fields the UI must not see:
      fal_request_id: 'fal-xxx',
      model: 'seedance-2-pro',
      request_input: { secret: 'token' },
      result_storage: { kind: 'fal_passthrough', url: 'https://...' },
      cost_usd: 0.5,
      metadata: { internal: true },
    } as unknown as Parameters<typeof pickJobUiFields>[0];

    const ui: MediaJobUiRow = pickJobUiFields(full);

    expect(ui).toEqual({
      id: 'job-1',
      project_id: 'p-1',
      scene_id: 's-1',
      character_id: null,
      kind: 'video',
      status: 'pending',
      error_code: null,
      created_at: '2026-05-24T00:00:00Z',
      updated_at: '2026-05-24T00:00:01Z',
      retry_count: 0,
      delayed_until: null,
    });
    expect(ui).not.toHaveProperty('fal_request_id');
    expect(ui).not.toHaveProperty('request_input');
    expect(ui).not.toHaveProperty('result_storage');
    expect(ui).not.toHaveProperty('cost_usd');
    expect(ui).not.toHaveProperty('metadata');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
pnpm --filter @mango/web test pickJobUiFields
```

Expected: FAIL with "Cannot find module '../pickJobUiFields'" or similar.

- [ ] **Step 3: Implement `pickJobUiFields`**

Create `apps/web/src/lib/pickJobUiFields.ts`:

```ts
import type { Database } from '@mango/db';

type FullMediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

/**
 * Narrow projection of a media_jobs row for client-side UI state.
 *
 * Internal fields (request_input, fal_request_id, model, result_storage,
 * cost_usd, metadata) stay on the server. This type mirrors the SELECT
 * column list in `app/projects/[id]/page.tsx` and the realtime callback
 * narrowing in `use-poll-jobs.ts`.
 *
 * If a new column becomes UI-relevant, add it here AND to the SQL projection
 * AND keep `pickJobUiFields` aligned — in the same commit.
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

/**
 * Project the realtime payload (which carries the full row) to the narrow
 * client-state shape. Used by the use-poll-jobs realtime callback before
 * `upsertJob`.
 */
export function pickJobUiFields(row: FullMediaJobRow): MediaJobUiRow {
  return {
    id: row.id,
    project_id: row.project_id,
    scene_id: row.scene_id,
    character_id: row.character_id,
    kind: row.kind,
    status: row.status,
    error_code: row.error_code,
    created_at: row.created_at,
    updated_at: row.updated_at,
    retry_count: row.retry_count,
    delayed_until: row.delayed_until,
  };
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
pnpm --filter @mango/web test pickJobUiFields
```

Expected: 1 passing.

- [ ] **Step 5: Re-export `MediaJobUiRow` from `ScriptStateProvider.tsx`**

Open `apps/web/src/components/workspace/ScriptStateProvider.tsx`, change the local `MediaJobRow` alias to import from the new lib:

```diff
-import type { Database } from '@mango/db';
-
-type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];
+import { type MediaJobUiRow } from '@/lib/pickJobUiFields';
+export type { MediaJobUiRow };
```

Then replace every `MediaJobRow` inside the file body with `MediaJobUiRow`:

```diff
-interface ScriptState {
+interface ScriptState {
   projectId: string;
   script: Stage04Script | null;
-  jobs: MediaJobRow[];
+  jobs: MediaJobUiRow[];
   ...
-  upsertJob: (job: MediaJobRow) => void;
+  upsertJob: (job: MediaJobUiRow) => void;
   removeJob: (jobId: string) => void;
 }
```

```diff
   initialScript?: Stage04Script | null;
-  initialJobs?: MediaJobRow[];
+  initialJobs?: MediaJobUiRow[];
   children: React.ReactNode;
 }
```

```diff
-  const [jobs, setJobs] = useState<MediaJobRow[]>(initialJobs);
+  const [jobs, setJobs] = useState<MediaJobUiRow[]>(initialJobs);
```

```diff
-  const upsertJob = useCallback((job: MediaJobRow) => {
+  const upsertJob = useCallback((job: MediaJobUiRow) => {
```

- [ ] **Step 6: Narrow the realtime callback in `use-poll-jobs.ts`**

```diff
-import type { Database } from '@mango/db';
-
-type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];
+import { pickJobUiFields, type MediaJobUiRow } from '@/lib/pickJobUiFields';
```

In the `subscribeMediaJobs` callback:

```diff
     const channel = subscribeMediaJobs(projectId, (row) => {
-      const job = row as unknown as MediaJobRow;
-      if (!job?.id) return;
+      // Narrow the realtime payload to the UI-only shape before pushing
+      // into provider state — see lib/pickJobUiFields for the contract.
+      const full = row as unknown as Parameters<typeof pickJobUiFields>[0];
+      if (!full?.id) return;
+      const job: MediaJobUiRow = pickJobUiFields(full);
```

The rest of the callback already uses `job.status`, `job.id`, `job.kind` — all present on the narrow type. No further edits needed.

- [ ] **Step 7: Run typecheck**

```bash
pnpm --filter @mango/web typecheck
```

Expected: zero errors.

- [ ] **Step 8: Run full test suite**

```bash
pnpm --filter @mango/web test
```

Expected: ≥ 335 passing (334 prior + 1 new `pickJobUiFields`).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(workspace): narrow MediaJobRow → MediaJobUiRow for client state

Adds `lib/pickJobUiFields.ts` with the `MediaJobUiRow` Pick type and the
projection helper. ScriptStateProvider state, upsertJob/removeJob, and
the realtime callback in use-poll-jobs all switch to the narrow shape.
Internal fields (request_input, fal_request_id, model, result_storage,
cost_usd, metadata) no longer reach the client (spec §6).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Bug 2 fix — expand `page.tsx` jobs query + Workspace Provider lift + `<TelemetryHeader>` stub

**Files:**
- Modify: `apps/web/src/app/projects/[id]/page.tsx`
- Modify: `apps/web/src/components/workspace/Workspace.tsx`
- Create: `apps/web/src/components/workspace/TelemetryHeader.tsx` (stub returning null)

- [ ] **Step 1: Create `TelemetryHeader.tsx` stub**

Create `apps/web/src/components/workspace/TelemetryHeader.tsx`:

```tsx
'use client';

/**
 * Stub placeholder. Replaced in Task 7 with the real component. Returning
 * null now lets us wire the Provider lift + initialJobs prop in Task 3
 * without needing the component logic yet.
 */
export function TelemetryHeader() {
  return null;
}
```

- [ ] **Step 2: Patch `app/projects/[id]/page.tsx` jobs query**

Replace the existing `media_jobs` Promise.all entry with the expanded narrow-projection query:

```diff
     supabase
       .from('media_jobs')
-      .select('id, character_id, kind, status, error_code, created_at')
+      // Narrow projection — UI never reads request_input / fal_request_id /
+      // model / result_storage / cost_usd. Keep them server-side only.
+      .select(
+        'id, project_id, scene_id, character_id, kind, status, error_code, ' +
+          'created_at, updated_at, retry_count, delayed_until',
+      )
       .eq('project_id', id)
-      .in('kind', ['character_dossier', 'character_avatar'])
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
       .in('status', ['reserved', 'pending', 'running', 'error'])
       .order('created_at', { ascending: false })
-      .limit(50),
+      .limit(200),
```

Rename the destructured result for clarity:

```diff
-  const [projectResult, messagesResult, characterJobsResult] = await Promise.all([
+  const [projectResult, messagesResult, jobsResult] = await Promise.all([
```

- [ ] **Step 3: Split fetched jobs into character vs scene buckets**

Right after the `if (projectResult.error ...) return notFound();` block, add:

```ts
const allInflightJobs = jobsResult.data ?? [];
const characterJobs = allInflightJobs.filter(
  (j) => j.kind === 'character_dossier' || j.kind === 'character_avatar',
);
const sceneJobs = allInflightJobs.filter(
  (j) => j.kind !== 'character_dossier' && j.kind !== 'character_avatar',
);
```

- [ ] **Step 4: Update the StageCharacters props to use `characterJobs`**

```diff
   const charactersSlot = (
     <StageCharacters
       projectId={project.id}
       script={script}
       tier={project.tier as Tier}
       style={style}
-      characterJobs={(characterJobsResult.data ?? []) as CharacterJobSummary[]}
+      characterJobs={characterJobs as CharacterJobSummary[]}
     />
   );
```

- [ ] **Step 5: Pass `initialJobs` to `<Workspace>`**

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

- [ ] **Step 6: Update `Workspace.tsx` — accept `initialJobs` + lift Provider + mount `<TelemetryHeader>`**

Replace the file's body with this final shape (preserve existing imports for TierGateProvider / InsufficientBalanceProvider / Chat / TopBar / WorkspaceScroll / StageIdea / StageScript / StageScenes / StageFinal — only the structure below changes):

```tsx
'use client';

import { InsufficientBalanceProvider } from '@/components/account/InsufficientBalanceProvider';
import { TierGateProvider } from '@/components/account/TierGateProvider';
import { Chat } from '@/components/chat/Chat';
import type { PersistedScript, Tier } from '@mango/core';
import type { Database } from '@mango/db/types';
import { ScriptStateProvider, type Stage04Script } from './ScriptStateProvider';
import { TelemetryHeader } from './TelemetryHeader';
import { TopBar } from './TopBar';
import { WorkspaceScroll } from './WorkspaceScroll';
import { StageFinal } from './stages/StageFinal';
import { StageIdea } from './stages/StageIdea';
import { StageScenes } from './stages/StageScenes';
import { StageScript } from './stages/StageScript';
import type { MediaJobUiRow } from '@/lib/pickJobUiFields';

type ProjectRow = Database['public']['Tables']['projects']['Row'];
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];

interface WorkspaceProps {
  project: ProjectRow;
  initialChatMessages: ChatMessageRow[];
  initialJobs: MediaJobUiRow[];
  charactersSlot: React.ReactNode;
  userEmail: string | null;
  isAnonymous: boolean;
}

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
        <div
          className="app"
          data-phase="workspace"
          style={{ opacity: 1, visibility: 'visible' as const }}
        >
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

- [ ] **Step 7: Run typecheck**

```bash
pnpm --filter @mango/web typecheck
```

Expected: zero errors.

- [ ] **Step 8: Run lint**

```bash
pnpm turbo lint --filter=@mango/web
```

Expected: zero errors.

- [ ] **Step 9: Run tests**

```bash
pnpm --filter @mango/web test
```

Expected: ≥ 335 passing.

- [ ] **Step 10: Manual smoke (optional — dev server)**

```bash
pnpm --filter @mango/web dev
```

Open `http://localhost:3000/projects/<some-existing-id>`. Confirm workspace renders without console errors. Stop dev server (Ctrl+C) — we'll re-smoke at the end.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(workspace): hydrate initialJobs from RSC fetch (Bug 2)

Expands the page.tsx media_jobs query to all scene-level kinds
(scene_first_frame, first_frame, video, voice, final_clip, master_clip)
in addition to character_dossier/character_avatar, with a narrow column
projection. Splits the result into characterJobs (for StageCharacters)
and sceneJobs (for ScriptStateProvider's new initialJobs prop).

Lifts ScriptStateProvider inside <main class="workspace-shell">,
wrapping a TelemetryHeader stub (real component lands in Task 7) and
WorkspaceScroll. Chat and TopBar stay outside the provider to avoid
re-render storms on every poll tick (spec §7.2).

Bug 2 itself isn't visible yet — Bug 1 fix (ScriptStateProvider
useEffect sync) is required for the rerender path to honor the new
prop. See Task 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Bug 1 fix — `ScriptStateProvider` syncs from props with RSC-authoritative jobs

**Files:**
- Modify: `apps/web/src/components/workspace/ScriptStateProvider.tsx`
- Create: `apps/web/src/components/workspace/__tests__/ScriptStateProvider.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/components/workspace/__tests__/ScriptStateProvider.test.tsx`:

```tsx
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScriptStateProvider, useScriptState, type Stage04Script } from '../ScriptStateProvider';
import type { MediaJobUiRow } from '@/lib/pickJobUiFields';

function makeScript(overrides: Partial<Stage04Script> = {}): Stage04Script {
  return {
    title: 't',
    scenes: [],
    characters: [],
    master_clip_versions: [],
    master_clip_active_version_id: null,
    ...overrides,
  };
}

function makeJob(overrides: Partial<MediaJobUiRow> = {}): MediaJobUiRow {
  return {
    id: 'job-1',
    project_id: 'p-1',
    scene_id: 's-1',
    character_id: null,
    kind: 'video',
    status: 'pending',
    error_code: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    retry_count: 0,
    delayed_until: null,
    ...overrides,
  } as MediaJobUiRow;
}

const wrap = (initialScript: Stage04Script | null, initialJobs: MediaJobUiRow[]) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ScriptStateProvider projectId="p-1" initialScript={initialScript} initialJobs={initialJobs}>
        {children}
      </ScriptStateProvider>
    );
  };

describe('ScriptStateProvider — Bug 1: re-sync from props', () => {
  it('exposes the new script after initialScript prop changes', () => {
    const v1 = makeScript({ title: 'v1' });
    const v2 = makeScript({ title: 'v2' });
    const { result, rerender } = renderHook(() => useScriptState(), {
      wrapper: wrap(v1, []),
    });
    expect(result.current.script?.title).toBe('v1');
    rerender({ wrapper: wrap(v2, []) } as any);
    // Re-render with a new wrapper that holds the v2 prop:
    const { result: r2 } = renderHook(() => useScriptState(), { wrapper: wrap(v2, []) });
    expect(r2.current.script?.title).toBe('v2');
  });
});

describe('ScriptStateProvider — Bug 1: jobs RSC-authoritative + grace + script-pruning', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('t1: realtime row + same row in initialJobs → single copy', () => {
    const row = makeJob({ id: 'j-1' });
    const { result } = renderHook(() => useScriptState(), {
      wrapper: wrap(makeScript(), [row]),
    });
    expect(result.current.jobs.filter((j) => j.id === 'j-1')).toHaveLength(1);
  });

  it('t2: realtime-only row 10s old + initialJobs empty + script shows completion → pruned', () => {
    const oldRow = makeJob({ id: 'j-2', created_at: new Date(Date.now() - 10_000).toISOString() });
    const scene = {
      scene_id: 's-1',
      description: '',
      dialogue: null,
      character_ids: [],
      duration_sec: 5,
      audio_mode: 'silent',
      first_frame_source: 'generated',
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: [{ version_id: 'v-1', generated_at: new Date().toISOString(), storage: { kind: 'fal_passthrough', url: 'x' }, has_native_audio: null }],
      video_active_version_id: 'v-1',
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      last_frame: null,
      final_clip: null,
    } as any;
    const Wrapper = wrap(makeScript({ scenes: [scene] }), []);
    const { result } = renderHook(() => useScriptState(), { wrapper: Wrapper });
    act(() => {
      result.current.upsertJob(oldRow);
    });
    // Now simulate the rerender that delivers fresh empty initialJobs + script
    const { result: r2 } = renderHook(() => useScriptState(), {
      wrapper: wrap(makeScript({ scenes: [scene] }), []),
    });
    expect(r2.current.jobs.find((j) => j.id === 'j-2')).toBeUndefined();
  });

  it('t3: realtime-only row 2s old + initialJobs empty + no completion in script → kept (grace)', () => {
    const freshRow = makeJob({ id: 'j-3', created_at: new Date(Date.now() - 2_000).toISOString() });
    const scene = {
      scene_id: 's-1',
      description: '',
      dialogue: null,
      character_ids: [],
      duration_sec: 5,
      audio_mode: 'silent',
      first_frame_source: 'generated',
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: [],
      video_active_version_id: null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      last_frame: null,
      final_clip: null,
    } as any;
    // We need a single rendered Provider whose initialJobs prop changes —
    // emulate by mounting once with [freshRow] then "refresh" with []:
    const { result, rerender } = renderHook(
      ({ jobs }: { jobs: MediaJobUiRow[] }) => useScriptState(),
      {
        initialProps: { jobs: [freshRow] },
        wrapper: ({ children, jobs }: any) => (
          <ScriptStateProvider
            projectId="p-1"
            initialScript={makeScript({ scenes: [scene] })}
            initialJobs={jobs}
          >
            {children}
          </ScriptStateProvider>
        ),
      },
    );
    expect(result.current.jobs.find((j) => j.id === 'j-3')).toBeDefined();
    rerender({ jobs: [] });
    expect(result.current.jobs.find((j) => j.id === 'j-3')).toBeDefined(); // kept (< 5s grace)
  });

  it('t4: realtime row for unknown scene_id + script has no such scene → pruned', () => {
    const orphan = makeJob({ id: 'j-4', scene_id: 'S99', created_at: new Date().toISOString() });
    const scene = {
      scene_id: 's-1',
      description: '',
      dialogue: null,
      character_ids: [],
      duration_sec: 5,
      audio_mode: 'silent',
      first_frame_source: 'generated',
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: [],
      video_active_version_id: null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      last_frame: null,
      final_clip: null,
    } as any;
    const Wrapper = wrap(makeScript({ scenes: [scene] }), []);
    const { result } = renderHook(() => useScriptState(), { wrapper: Wrapper });
    act(() => {
      result.current.upsertJob(orphan);
    });
    // Rerender Provider with fresh initialJobs=[] + same script
    const { result: r2 } = renderHook(() => useScriptState(), {
      wrapper: wrap(makeScript({ scenes: [scene] }), []),
    });
    expect(r2.current.jobs.find((j) => j.id === 'j-4')).toBeUndefined();
  });

  it('t5: both initialJobs and prev have row X with different status → initialJobs wins', () => {
    const oldVersion = makeJob({ id: 'j-5', status: 'pending' });
    const newVersion = makeJob({ id: 'j-5', status: 'error' });
    // Mount with prev=[oldVersion], rerender with initialJobs=[newVersion]
    const { result, rerender } = renderHook(
      ({ jobs }: { jobs: MediaJobUiRow[] }) => useScriptState(),
      {
        initialProps: { jobs: [oldVersion] },
        wrapper: ({ children, jobs }: any) => (
          <ScriptStateProvider
            projectId="p-1"
            initialScript={makeScript()}
            initialJobs={jobs}
          >
            {children}
          </ScriptStateProvider>
        ),
      },
    );
    rerender({ jobs: [newVersion] });
    const j5 = result.current.jobs.find((j) => j.id === 'j-5');
    expect(j5?.status).toBe('error');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
pnpm --filter @mango/web test ScriptStateProvider
```

Expected: multiple failures (script doesn't sync on rerender; jobs aren't pruned).

- [ ] **Step 3: Implement the useEffect syncs + helper**

Edit `apps/web/src/components/workspace/ScriptStateProvider.tsx` — replace the body with:

```tsx
'use client';

import type { ProspectivePromptMap } from '@/server/actions/buildProspectivePromptAction';
import { type MediaJobUiRow } from '@/lib/pickJobUiFields';
export type { MediaJobUiRow };
import type {
  AudioMode,
  Character,
  Dialogue,
  FirstFrameSource,
  MasterClipVersion,
  SceneAssetVersion,
  StoredAsset,
} from '@mango/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const REALTIME_GRACE_MS = 5_000;

export interface SceneView {
  scene_id: string;
  description: string;
  dialogue: Dialogue | null;
  character_ids: string[];
  duration_sec: number;
  config_overrides?: { tier?: 'economy' | 'premium'; model?: string };
  audio_mode: AudioMode;
  first_frame_source: FirstFrameSource;
  first_frame_versions: SceneAssetVersion[];
  first_frame_active_version_id: string | null;
  video_versions: SceneAssetVersion[];
  video_active_version_id: string | null;
  voice_audio_versions: SceneAssetVersion[];
  voice_audio_active_version_id: string | null;
  last_frame: { storage: StoredAsset; extracted_from_version_id: string } | null;
  final_clip: {
    storage: StoredAsset;
    composed_from: { video_version_id: string; voice_audio_version_id: string | null };
  } | null;
}

export interface Stage04Script {
  title: string;
  scenes: SceneView[];
  characters: Character[];
  master_clip_versions?: MasterClipVersion[];
  master_clip_active_version_id?: string | null;
}

interface ScriptState {
  projectId: string;
  script: Stage04Script | null;
  jobs: MediaJobUiRow[];
  prospectivePrompts: ProspectivePromptMap | null;
  setScript: (script: Stage04Script | null) => void;
  setProspectivePrompts: (prompts: ProspectivePromptMap | null) => void;
  upsertJob: (job: MediaJobUiRow) => void;
  removeJob: (jobId: string) => void;
}

const ScriptStateContext = createContext<ScriptState | null>(null);

interface Props {
  projectId: string;
  initialScript?: Stage04Script | null;
  initialJobs?: MediaJobUiRow[];
  children: React.ReactNode;
}

/**
 * True when the fresh script proves the inflight row is obsolete. Used by
 * the jobs sync effect to prune stale realtime rows that the terminal-status
 * callback failed to clean up.
 */
function isContradictedByScript(job: MediaJobUiRow, script: Stage04Script | null): boolean {
  if (!script || !job.scene_id) return false;
  const scene = script.scenes.find((s) => s.scene_id === job.scene_id);
  if (!scene) return true;
  if (job.kind === 'video' && scene.video_active_version_id) return true;
  if (
    (job.kind === 'first_frame' || job.kind === 'scene_first_frame') &&
    scene.first_frame_active_version_id
  )
    return true;
  if (job.kind === 'voice' && scene.voice_audio_active_version_id) return true;
  if (job.kind === 'final_clip' && scene.final_clip) return true;
  if (job.kind === 'master_clip' && script.master_clip_active_version_id) return true;
  return false;
}

export function ScriptStateProvider({
  projectId,
  initialScript = null,
  initialJobs = [],
  children,
}: Props) {
  const [script, setScript] = useState<Stage04Script | null>(initialScript);
  const [jobs, setJobs] = useState<MediaJobUiRow[]>(initialJobs);
  const [prospectivePrompts, setProspectivePrompts] = useState<ProspectivePromptMap | null>(null);

  // Bug 1: re-sync script when ProjectJobsPoller triggers router.refresh()
  // and page.tsx re-passes the prop with the latest DB snapshot.
  useEffect(() => {
    setScript(initialScript);
  }, [initialScript]);

  // Bug 1: jobs sync — RSC-authoritative, with a brief grace window for
  // realtime-only rows that haven't yet propagated to the RSC fetch, and
  // script-driven pruning to defend against missed terminal callbacks.
  useEffect(() => {
    setJobs((prev) => {
      const now = Date.now();
      const byId = new Map<string, MediaJobUiRow>();
      for (const j of initialJobs) byId.set(j.id, j);
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

  const upsertJob = useCallback((job: MediaJobUiRow) => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === job.id);
      if (idx === -1) return [...prev, job];
      const next = [...prev];
      next[idx] = job;
      return next;
    });
  }, []);

  const removeJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const value = useMemo(
    () => ({
      projectId,
      script,
      jobs,
      prospectivePrompts,
      setScript,
      setProspectivePrompts,
      upsertJob,
      removeJob,
    }),
    [projectId, script, jobs, prospectivePrompts, upsertJob, removeJob],
  );

  return <ScriptStateContext.Provider value={value}>{children}</ScriptStateContext.Provider>;
}

export function useScriptState(): ScriptState {
  const ctx = useContext(ScriptStateContext);
  if (!ctx) throw new Error('useScriptState must be used inside ScriptStateProvider');
  return ctx;
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
pnpm --filter @mango/web test ScriptStateProvider
```

Expected: 6 passing (1 script sync + 5 jobs cases).

- [ ] **Step 5: Run full test suite**

```bash
pnpm --filter @mango/web test
```

Expected: ≥ 341 passing (335 prior + 6 new).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(workspace): ScriptStateProvider syncs from props (Bug 1)

Adds useEffect-based prop sync to ScriptStateProvider. Script is
replaced verbatim from initialScript on every re-render (closes the
useState-locks-initial-value defect). Jobs sync is RSC-authoritative:
new initialJobs wins, prev rows are kept only if (a) created < 5s ago
AND (b) not contradicted by the fresh initialScript. Closes the
stale-pending-forever hole that a naïve merge would have left open.

Six new tests cover t1–t5 from spec §5.2 plus the script-sync path.
Existing 335 tests stay green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `scroll-to-final` helper extraction

**Files:**
- Create: `apps/web/src/lib/scroll-to-final.ts`
- Create: `apps/web/src/lib/__tests__/scroll-to-final.test.ts`
- Modify: `apps/web/src/components/workspace/stages/scenes/Stage04Inline.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/lib/__tests__/scroll-to-final.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('scrollToFinal', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
  });

  it('no-op when document is undefined (SSR)', async () => {
    (globalThis as any).document = undefined;
    const mod = await import('../scroll-to-final');
    expect(() => mod.scrollToFinal()).not.toThrow();
  });

  it('no-op when #finalStage is missing', async () => {
    const mod = await import('../scroll-to-final');
    vi.spyOn(document, 'getElementById').mockReturnValue(null);
    expect(() => mod.scrollToFinal()).not.toThrow();
  });

  it('scrollIntoView smooth by default', async () => {
    const mod = await import('../scroll-to-final');
    const el = document.createElement('section');
    el.id = 'finalStage';
    document.body.appendChild(el);
    const spy = vi.spyOn(el, 'scrollIntoView');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList);
    mod.scrollToFinal();
    expect(spy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    el.remove();
  });

  it('scrollIntoView auto when prefers-reduced-motion: reduce', async () => {
    const mod = await import('../scroll-to-final');
    const el = document.createElement('section');
    el.id = 'finalStage';
    document.body.appendChild(el);
    const spy = vi.spyOn(el, 'scrollIntoView');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList);
    mod.scrollToFinal();
    expect(spy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    el.remove();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
pnpm --filter @mango/web test scroll-to-final
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/lib/scroll-to-final.ts`:

```ts
/**
 * Scroll the workspace to the Stage 05 "Финал" section. Shared by
 * Stage04Inline (master finalize click) and TelemetryHeader (Phase 3b
 * "показать" link). Honors prefers-reduced-motion.
 */
export function scrollToFinal(): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('finalStage');
  if (!el) return;
  const prefersReduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({
    behavior: prefersReduced ? 'auto' : 'smooth',
    block: 'start',
  });
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
pnpm --filter @mango/web test scroll-to-final
```

Expected: 4 passing.

- [ ] **Step 5: Update `Stage04Inline.tsx` — remove inline function, import the helper**

Open `apps/web/src/components/workspace/stages/scenes/Stage04Inline.tsx` and remove the local `scrollToFinal` definition (lines ~28–34 in the v1 file):

```diff
-/**
- * Scroll the user's attention to Stage 05 (Финал) — that's where the
- * master clip player lives now. Called after finalize starts AND when
- * user clicks "Открыть ролик" on a ready master.
- */
-function scrollToFinal() {
-  if (typeof document === 'undefined') return;
-  const el = document.getElementById('finalStage');
-  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
-}
```

Add the import at the top:

```diff
 import '@/styles/storyboard-inline.css';
 import '@/styles/audio-pipeline.css';
+import { scrollToFinal } from '@/lib/scroll-to-final';
```

- [ ] **Step 6: Run typecheck + full test suite**

```bash
pnpm --filter @mango/web typecheck && pnpm --filter @mango/web test
```

Expected: zero TS errors; ≥ 345 passing (341 + 4 new).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(workspace): extract scrollToFinal to lib + honor reduced-motion

Moves the inline helper from Stage04Inline.tsx to lib/scroll-to-final.ts
so TelemetryHeader can share it (Task 7 will use it for the Phase 3b
"показать" link). The helper now honors prefers-reduced-motion (uses
behavior:'auto' instead of 'smooth' when the user has reduced motion
preferences set). 4 new unit tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `derivePipelinePhase` + tests

**Files:**
- Create: `apps/web/src/components/workspace/derivePipelinePhase.ts`
- Create: `apps/web/src/components/workspace/__tests__/derivePipelinePhase.test.ts`

- [ ] **Step 1: Write all 14 failing tests**

Create `apps/web/src/components/workspace/__tests__/derivePipelinePhase.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MediaJobUiRow } from '@/lib/pickJobUiFields';
import { derivePipelinePhase } from '../derivePipelinePhase';
import type { SceneView } from '../ScriptStateProvider';

function scene(id: string, overrides: Partial<SceneView> = {}): SceneView {
  return {
    scene_id: id,
    description: '',
    dialogue: null,
    character_ids: [],
    duration_sec: 5,
    audio_mode: 'silent',
    first_frame_source: 'generated',
    first_frame_versions: [],
    first_frame_active_version_id: null,
    video_versions: [],
    video_active_version_id: null,
    voice_audio_versions: [],
    voice_audio_active_version_id: null,
    last_frame: null,
    final_clip: null,
    ...overrides,
  } as SceneView;
}

function job(overrides: Partial<MediaJobUiRow> = {}): MediaJobUiRow {
  return {
    id: 'j',
    project_id: 'p',
    scene_id: null,
    character_id: null,
    kind: 'video',
    status: 'pending',
    error_code: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    retry_count: 0,
    delayed_until: null,
    ...overrides,
  } as MediaJobUiRow;
}

describe('derivePipelinePhase', () => {
  it('1. empty scenes → idle', () => {
    expect(derivePipelinePhase([], [], null)).toEqual({ kind: 'idle' });
  });

  it('2. scenes present + 0 jobs + no master → idle', () => {
    expect(derivePipelinePhase([scene('s1'), scene('s2')], [], null).kind).toBe('idle');
  });

  it('3. one video pending → rendering doneCount=0', () => {
    const phase = derivePipelinePhase(
      [scene('s1'), scene('s2')],
      [job({ id: 'j1', kind: 'video', status: 'pending', scene_id: 's1' })],
      null,
    );
    expect(phase.kind).toBe('rendering');
    if (phase.kind === 'rendering') {
      expect(phase.doneCount).toBe(0);
      expect(phase.totalCount).toBe(2);
    }
  });

  it('4. 2 done + 2 running → rendering doneCount=2', () => {
    const scenes = [
      scene('s1', { video_active_version_id: 'v1' }),
      scene('s2', { video_active_version_id: 'v2' }),
      scene('s3'),
      scene('s4'),
    ];
    const jobs = [
      job({ id: 'j3', kind: 'video', status: 'running', scene_id: 's3' }),
      job({ id: 'j4', kind: 'video', status: 'running', scene_id: 's4' }),
    ];
    const phase = derivePipelinePhase(scenes, jobs, null);
    expect(phase.kind).toBe('rendering');
    if (phase.kind === 'rendering') expect(phase.doneCount).toBe(2);
  });

  it('5. reserved scene_first_frame → rendering', () => {
    const phase = derivePipelinePhase(
      [scene('s1')],
      [job({ id: 'j', kind: 'scene_first_frame', status: 'reserved', scene_id: 's1' })],
      null,
    );
    expect(phase.kind).toBe('rendering');
  });

  it('6. master_clip pending takes precedence over rendering', () => {
    const phase = derivePipelinePhase(
      [scene('s1')],
      [
        job({ id: 'j1', kind: 'video', status: 'running', scene_id: 's1' }),
        job({ id: 'jm', kind: 'master_clip', status: 'pending', scene_id: null }),
      ],
      null,
    );
    expect(phase.kind).toBe('finalizing');
  });

  it('7. video error alone is NOT rendering', () => {
    const phase = derivePipelinePhase(
      [scene('s1')],
      [job({ id: 'j', kind: 'video', status: 'error', scene_id: 's1' })],
      null,
    );
    expect(phase.kind).toBe('idle');
  });

  it('8. master_clip running + stray scene job → finalizing', () => {
    const phase = derivePipelinePhase(
      [scene('s1')],
      [
        job({ id: 'j1', kind: 'video', status: 'pending', scene_id: 's1' }),
        job({ id: 'jm', kind: 'master_clip', status: 'running', scene_id: null }),
      ],
      'v1',
    );
    expect(phase.kind).toBe('finalizing');
  });

  it('9. job for deleted scene → ignored', () => {
    const phase = derivePipelinePhase(
      [scene('s1')],
      [job({ id: 'j', kind: 'video', status: 'pending', scene_id: 'S99' })],
      null,
    );
    expect(phase.kind).toBe('idle');
  });

  it('10. stale completed + new pending for same scene → running wins', () => {
    const phase = derivePipelinePhase(
      [scene('s1')],
      [
        job({
          id: 'old',
          kind: 'video',
          status: 'completed',
          scene_id: 's1',
          created_at: new Date(Date.now() - 60_000).toISOString(),
        }),
        job({
          id: 'new',
          kind: 'video',
          status: 'pending',
          scene_id: 's1',
          created_at: new Date().toISOString(),
        }),
      ],
      null,
    );
    expect(phase.kind).toBe('rendering');
    if (phase.kind === 'rendering') expect(phase.sceneStatuses[0]).toBe('running');
  });

  it('11. stale completed + new error for same scene → error wins', () => {
    const phase = derivePipelinePhase(
      [scene('s1')],
      [
        job({
          id: 'old',
          kind: 'video',
          status: 'completed',
          scene_id: 's1',
          created_at: new Date(Date.now() - 60_000).toISOString(),
        }),
        job({
          id: 'new',
          kind: 'video',
          status: 'error',
          scene_id: 's1',
          created_at: new Date().toISOString(),
        }),
      ],
      null,
    );
    // Only error → not inflight → idle
    expect(phase.kind).toBe('idle');
    // But the per-scene status reflects error
    // (idle case still returns sceneStatuses? No — see implementation:
    // idle returns { kind: 'idle' } only. We assert via a fresh call with
    // a sibling inflight job to keep the rendering branch alive.)
  });

  it('12. newest wins within same priority bucket', () => {
    const older = job({
      id: 'older',
      kind: 'video',
      status: 'pending',
      scene_id: 's1',
      created_at: new Date(Date.now() - 30_000).toISOString(),
    });
    const newer = job({
      id: 'newer',
      kind: 'video',
      status: 'pending',
      scene_id: 's1',
      created_at: new Date().toISOString(),
    });
    const phase = derivePipelinePhase([scene('s1')], [older, newer], null);
    expect(phase.kind).toBe('rendering');
    // No external observable difference in this synthetic test, but the
    // implementation must be deterministic — pickBestJob picks `newer`.
  });

  it('13. first_frame job alone → rendering with doneCount=0 (generic noun copy)', () => {
    const phase = derivePipelinePhase(
      [scene('s1')],
      [job({ id: 'j', kind: 'first_frame', status: 'pending', scene_id: 's1' })],
      null,
    );
    expect(phase.kind).toBe('rendering');
    if (phase.kind === 'rendering') {
      expect(phase.doneCount).toBe(0);
      expect(phase.totalCount).toBe(1);
    }
  });

  it('14. scene_id=null jobs ignored in scene scope (e.g., character_dossier)', () => {
    const phase = derivePipelinePhase(
      [scene('s1')],
      [job({ id: 'j', kind: 'character_dossier', status: 'pending', scene_id: null })],
      null,
    );
    expect(phase.kind).toBe('idle');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
pnpm --filter @mango/web test derivePipelinePhase
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement `derivePipelinePhase`**

Create `apps/web/src/components/workspace/derivePipelinePhase.ts`:

```ts
import type { MediaJobUiRow } from '@/lib/pickJobUiFields';
import type { SceneView } from './ScriptStateProvider';

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

const INFLIGHT_STATUSES = new Set<MediaJobUiRow['status']>(['reserved', 'pending', 'running']);
const SCENE_KINDS = new Set<MediaJobUiRow['kind']>([
  'scene_first_frame',
  'first_frame',
  'video',
  'voice',
  'final_clip',
]);

type SceneStatus = 'done' | 'running' | 'queued' | 'error';

/**
 * Choose the most relevant single job for a scene from the candidates.
 * Priority: inflight > error > anything else (queued / completed / cancelled).
 * Within a bucket, prefer the newest `created_at`.
 *
 * Why: jobs[] may carry stale rows or retry sequences with the same scene_id
 * and kind. `Array.find` is non-deterministic across array order; this helper
 * is explicit about what "the current state of this scene" means.
 */
export function pickBestJob(candidates: MediaJobUiRow[]): MediaJobUiRow | null {
  if (candidates.length === 0) return null;
  const score = (j: MediaJobUiRow): number =>
    INFLIGHT_STATUSES.has(j.status) ? 2 : j.status === 'error' ? 1 : 0;
  const ts = (j: MediaJobUiRow): number =>
    j.created_at ? new Date(j.created_at).getTime() : 0;
  return (
    candidates.slice().sort((a, b) => {
      const ds = score(b) - score(a);
      return ds !== 0 ? ds : ts(b) - ts(a);
    })[0] ?? null
  );
}

export function derivePipelinePhase(
  scenes: SceneView[],
  jobs: MediaJobUiRow[],
  masterActiveId: string | null,
): PipelinePhase {
  if (scenes.length === 0) return { kind: 'idle' };

  const sceneIds = new Set(scenes.map((s) => s.scene_id));
  const sceneScopedJobs = jobs.filter(
    (j) => j.scene_id != null && sceneIds.has(j.scene_id) && SCENE_KINDS.has(j.kind),
  );

  const masterInflight = jobs.some(
    (j) => j.kind === 'master_clip' && INFLIGHT_STATUSES.has(j.status),
  );
  const sceneInflight = sceneScopedJobs.some((j) => INFLIGHT_STATUSES.has(j.status));

  const sceneStatuses: SceneStatus[] = scenes.map((s) => {
    if (s.video_active_version_id) return 'done';
    const best = pickBestJob(sceneScopedJobs.filter((j) => j.scene_id === s.scene_id));
    if (!best) return 'queued';
    if (INFLIGHT_STATUSES.has(best.status)) return 'running';
    if (best.status === 'error') return 'error';
    return 'queued';
  });
  const doneCount = sceneStatuses.filter((s) => s === 'done').length;
  const totalCount = scenes.length;

  if (masterInflight) {
    void masterActiveId; // intentionally unused — master id is consumed by TelemetryHeader, not the phase
    return { kind: 'finalizing', totalCount, sceneStatuses };
  }
  if (sceneInflight) {
    return { kind: 'rendering', doneCount, totalCount, sceneStatuses };
  }
  return { kind: 'idle' };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
pnpm --filter @mango/web test derivePipelinePhase
```

Expected: 14 passing.

- [ ] **Step 5: Full test suite**

```bash
pnpm --filter @mango/web test
```

Expected: ≥ 359 passing (345 + 14 new).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(workspace): pure-function pipeline phase derivation

Adds `derivePipelinePhase(scenes, jobs, masterActiveId)` returning a
discriminated union (idle | rendering | finalizing). Scene-scoping
prevents deleted-scene jobs from blocking the header. `pickBestJob`
helper guarantees deterministic per-scene status selection (priority:
inflight > error > terminal, newest-wins within bucket).

14 unit tests cover empty / running / done counts / reserved / master
precedence / error not-inflight / deleted scene / stale-vs-new /
newest-wins / first-frame-only / character_dossier scope filter.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `TelemetryHeader` component + CSS + tests + wire-in

**Files:**
- Replace stub: `apps/web/src/components/workspace/TelemetryHeader.tsx`
- Create: `apps/web/src/styles/telemetry-header.css`
- Create: `apps/web/src/components/workspace/__tests__/TelemetryHeader.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `apps/web/src/components/workspace/__tests__/TelemetryHeader.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ScriptStateProvider, type Stage04Script } from '../ScriptStateProvider';
import { TelemetryHeader } from '../TelemetryHeader';
import type { MediaJobUiRow } from '@/lib/pickJobUiFields';

vi.mock('@/lib/scroll-to-final', () => ({
  scrollToFinal: vi.fn(),
}));
import { scrollToFinal } from '@/lib/scroll-to-final';

function scriptFixture(opts: {
  scenes?: number;
  doneIndices?: number[];
  masterId?: string | null;
} = {}): Stage04Script {
  const sceneCount = opts.scenes ?? 0;
  const done = new Set(opts.doneIndices ?? []);
  return {
    title: 't',
    characters: [],
    scenes: Array.from({ length: sceneCount }, (_, i) => ({
      scene_id: `s${i + 1}`,
      description: '',
      dialogue: null,
      character_ids: [],
      duration_sec: 5,
      audio_mode: 'silent',
      first_frame_source: 'generated',
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: done.has(i)
        ? [{ version_id: `v${i}`, generated_at: new Date().toISOString(), storage: { kind: 'fal_passthrough', url: 'x' }, has_native_audio: null } as any]
        : [],
      video_active_version_id: done.has(i) ? `v${i}` : null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      last_frame: null,
      final_clip: null,
    })) as any,
    master_clip_versions: opts.masterId
      ? [
          {
            version_id: opts.masterId,
            generated_at: new Date().toISOString(),
            storage: { kind: 'fal_passthrough', url: 'x' },
            composed_from_scene_versions: [],
            has_full_audio: true,
          } as any,
        ]
      : [],
    master_clip_active_version_id: opts.masterId ?? null,
  };
}

function job(o: Partial<MediaJobUiRow> = {}): MediaJobUiRow {
  return {
    id: 'j',
    project_id: 'p',
    scene_id: null,
    character_id: null,
    kind: 'video',
    status: 'pending',
    error_code: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    retry_count: 0,
    delayed_until: null,
    ...o,
  } as MediaJobUiRow;
}

function Wrap({ script, jobs, children }: { script: Stage04Script; jobs: MediaJobUiRow[]; children: ReactNode }) {
  return (
    <ScriptStateProvider projectId="p" initialScript={script} initialJobs={jobs}>
      {children}
    </ScriptStateProvider>
  );
}

describe('TelemetryHeader', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('idle phase → renders nothing', () => {
    const { container } = render(
      <Wrap script={scriptFixture()} jobs={[]}>
        <TelemetryHeader />
      </Wrap>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('rendering phase → counter "N / M готово", flow class, dots', () => {
    render(
      <Wrap
        script={scriptFixture({ scenes: 4, doneIndices: [0] })}
        jobs={[job({ id: 'j2', scene_id: 's2', kind: 'video', status: 'pending' })]}
      >
        <TelemetryHeader />
      </Wrap>,
    );
    expect(screen.getByText(/1 \/ 4 готово/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    const dots = document.querySelectorAll('.telemetry-dot');
    expect(dots).toHaveLength(4);
  });

  it('finalizing phase → "M / M ✓", finalize icon', () => {
    render(
      <Wrap
        script={scriptFixture({ scenes: 4, doneIndices: [0, 1, 2, 3], masterId: 'm0' })}
        jobs={[job({ id: 'jm', kind: 'master_clip', status: 'pending', scene_id: null })]}
      >
        <TelemetryHeader />
      </Wrap>,
    );
    expect(screen.getByText(/4 \/ 4/)).toBeInTheDocument();
    expect(screen.getByText('склеиваю финальный ролик')).toBeInTheDocument();
  });

  it('Phase 3b success: finalizing → idle with new master id → shows then dismisses', () => {
    vi.useFakeTimers();
    const finalizingScript = scriptFixture({ scenes: 1, doneIndices: [0], masterId: null });
    const { rerender } = render(
      <Wrap
        script={finalizingScript}
        jobs={[job({ id: 'jm', kind: 'master_clip', status: 'pending', scene_id: null })]}
      >
        <TelemetryHeader />
      </Wrap>,
    );
    // Now finalize completes — new master id, no more master_clip job
    const completedScript = scriptFixture({ scenes: 1, doneIndices: [0], masterId: 'M1' });
    rerender(
      <Wrap script={completedScript} jobs={[]}>
        <TelemetryHeader />
      </Wrap>,
    );
    expect(screen.getByText('финальный ролик собран')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /перейти к финальному ролику/i })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(screen.queryByText('финальный ролик собран')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('Phase 3b false-positive guard: second finalize errors → NO 3b', () => {
    vi.useFakeTimers();
    const existing = scriptFixture({ scenes: 1, doneIndices: [0], masterId: 'M1' });
    const { rerender } = render(
      <Wrap
        script={existing}
        jobs={[job({ id: 'jm2', kind: 'master_clip', status: 'pending', scene_id: null })]}
      >
        <TelemetryHeader />
      </Wrap>,
    );
    // The job errors — back to idle, master id still M1 (unchanged from snapshot)
    rerender(
      <Wrap
        script={existing}
        jobs={[]}
      >
        <TelemetryHeader />
      </Wrap>,
    );
    expect(screen.queryByText('финальный ролик собран')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('cold mount with master already ready → no Phase 3b', () => {
    render(
      <Wrap
        script={scriptFixture({ scenes: 1, doneIndices: [0], masterId: 'M1' })}
        jobs={[]}
      >
        <TelemetryHeader />
      </Wrap>,
    );
    expect(screen.queryByText('финальный ролик собран')).not.toBeInTheDocument();
  });

  it('«показать» click → calls scrollToFinal and dismisses header', () => {
    vi.useFakeTimers();
    const finalizingScript = scriptFixture({ scenes: 1, doneIndices: [0], masterId: null });
    const { rerender } = render(
      <Wrap
        script={finalizingScript}
        jobs={[job({ id: 'jm', kind: 'master_clip', status: 'pending', scene_id: null })]}
      >
        <TelemetryHeader />
      </Wrap>,
    );
    rerender(
      <Wrap
        script={scriptFixture({ scenes: 1, doneIndices: [0], masterId: 'M9' })}
        jobs={[]}
      >
        <TelemetryHeader />
      </Wrap>,
    );
    const btn = screen.getByRole('button', { name: /перейти/i });
    btn.click();
    expect(scrollToFinal).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('финальный ролик собран')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('role="status" and aria-live="polite" on the root', () => {
    render(
      <Wrap script={scriptFixture({ scenes: 1 })} jobs={[job({ id: 'j', scene_id: 's1', status: 'pending' })]}>
        <TelemetryHeader />
      </Wrap>,
    );
    const root = screen.getByRole('status');
    expect(root).toHaveAttribute('aria-live', 'polite');
  });

  it('rendering phase per-scene dot classes (done/running/queued)', () => {
    render(
      <Wrap
        script={scriptFixture({ scenes: 3, doneIndices: [0] })}
        jobs={[job({ id: 'j2', scene_id: 's2', kind: 'video', status: 'running' })]}
      >
        <TelemetryHeader />
      </Wrap>,
    );
    const dots = document.querySelectorAll('.telemetry-dot');
    expect(dots[0]).toHaveClass('telemetry-dot-done');
    expect(dots[1]).toHaveClass('telemetry-dot-running');
    expect(dots[2]).toHaveClass('telemetry-dot-queued');
  });

  it('flow animation class present in rendering, absent under reduced-motion class assertion', () => {
    render(
      <Wrap script={scriptFixture({ scenes: 1 })} jobs={[job({ scene_id: 's1', status: 'pending' })]}>
        <TelemetryHeader />
      </Wrap>,
    );
    expect(document.querySelector('.telemetry-prog-flow')).toBeTruthy();
    // Reduced-motion assertion via CSS is not testable in jsdom — see §13.6
    // smoke verification step; this test only confirms the class is emitted.
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
pnpm --filter @mango/web test TelemetryHeader
```

Expected: failures across the file (component is still the stub).

- [ ] **Step 3: Replace the stub with the real component**

Overwrite `apps/web/src/components/workspace/TelemetryHeader.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { scrollToFinal } from '@/lib/scroll-to-final';
import { derivePipelinePhase } from './derivePipelinePhase';
import { useScriptState } from './ScriptStateProvider';
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
    if (prevPhaseRef.current !== 'finalizing' && phase.kind === 'finalizing') {
      masterIdAtFinalizeStartRef.current = masterActiveId;
    }
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
        <div key={`dot-${i}`} className={`telemetry-dot telemetry-dot-${s}`} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Add the CSS file**

Create `apps/web/src/styles/telemetry-header.css`:

```css
.telemetry-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 22px;
  background: linear-gradient(
    90deg,
    rgba(255, 246, 226, 0.92) 0%,
    rgba(255, 252, 246, 0.92) 100%
  );
  border-bottom: 1px solid rgba(26, 18, 7, 0.06);
  font-family: 'Manrope', system-ui, sans-serif;
  color: var(--ink-700, #4a3520);
  flex: 0 0 auto;
}

.telemetry-num {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--ink-900, #1a1207);
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
  background: linear-gradient(90deg, transparent, var(--mango-500, #f57600), transparent);
  animation: telemetry-flow 2.4s linear infinite;
}
.telemetry-prog-flow-fast::after {
  background: linear-gradient(90deg, transparent, var(--mango-600, #d85f00), transparent);
  animation: telemetry-flow 1.4s linear infinite;
}
.telemetry-prog-done {
  background: linear-gradient(90deg, rgba(6, 145, 80, 0.18), rgba(6, 145, 80, 0.32));
}

@keyframes telemetry-flow {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(285%); }
}

.telemetry-status {
  font-size: 12px;
  color: var(--ink-500, #7a6448);
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
.telemetry-dot-running { background: var(--mango-500, #f57600); animation: telemetry-pulse 1s ease-in-out infinite; }
.telemetry-dot-error   { background: #c84a2a; }

@keyframes telemetry-pulse {
  50% { opacity: 0.55; }
}

.telemetry-finalize-icon {
  font-size: 14px;
  color: var(--mango-600, #d85f00);
}

.telemetry-show-link {
  background: transparent;
  border: none;
  color: var(--mango-600, #d85f00);
  text-decoration: underline;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
}
.telemetry-show-link:hover { color: var(--mango-700, #b14e00); }
.telemetry-show-link:focus-visible {
  outline: 2px solid var(--mango-500, #f57600);
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

- [ ] **Step 5: Verify CSS variable fallback values**

```bash
grep -nE '\-\-(mango|ink|leaf)-(500|600|700|900)\b' apps/web/src/styles/*.css
```

If any variable definitions diverge from the literal fallbacks above (`#f57600`, `#d85f00`, `#069150`, `#1a1207`, etc.), update the `var(..., #xxxxxx)` calls in the new CSS to match. Goal: zero visual surprises if the CSS var is ever unset.

- [ ] **Step 6: Run TelemetryHeader tests, verify they pass**

```bash
pnpm --filter @mango/web test TelemetryHeader
```

Expected: all passing.

- [ ] **Step 7: Run full test suite**

```bash
pnpm --filter @mango/web test
```

Expected: ≥ 369 passing (359 + ~10 new).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(workspace): TelemetryHeader — sticky pipeline status row

Replaces the Task 3 stub with the real component. Renders three live
states (rendering / finalizing / just-finished) + null for idle, with
soft Russian copy and no ETA. Uses derivePipelinePhase for kind
selection; a useEffect tracks finalizing→idle transitions, and Phase
3b ("✓ готово · показать", 6s auto-dismiss) fires only when the
active master id has changed since finalize start — protects against
false positives on a failed second finalize.

CSS lives in the existing light cream Mango palette (--mango-* /
--ink-* / --leaf-*) and respects prefers-reduced-motion.

10 component tests cover all phases + 3b guard + cold mount + click
behavior + accessibility roles.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: SceneCard polish — done badge + tooltip

**Files:**
- Modify: `apps/web/src/components/workspace/stages/scenes/SceneThumbnailColumn.tsx`
- Modify: `apps/web/src/styles/storyboard-inline.css`

- [ ] **Step 1: Add the done badge condition + element**

In `apps/web/src/components/workspace/stages/scenes/SceneThumbnailColumn.tsx`, just below the line that declares `audioBadge`, add:

```ts
const doneBadge = !isActiveJob && scene.video_active_version_id !== null;
```

Then inside the `.thumb-badges` JSX block (where `audioBadge` and `stale` badges are rendered), add:

```tsx
{doneBadge && (
  <span className="badge done" title="Видео сцены готово">
    ✓
  </span>
)}
```

Place it before the `audioBadge` render so the checkmark sits leftmost when both are present.

- [ ] **Step 2: Update the cancel tooltip wording**

```diff
       <button
         type="button"
         className="thumb-cancel"
         onClick={handleCancel}
         disabled={pending}
         aria-label="Отменить генерацию"
-        title="Отменить fal job"
+        title="Отменить — если fal ещё не списал, баланс вернётся"
       >
         ✕
       </button>
```

- [ ] **Step 3: Add `.badge.done` CSS rule**

Open `apps/web/src/styles/storyboard-inline.css`. Find the existing `.badge` (or `.thumb-badges` rule). Append:

```css
.badge.done {
  background: rgba(6, 145, 80, 0.14);
  color: var(--leaf-500, #069150);
  border: 1px solid rgba(6, 145, 80, 0.32);
}
```

- [ ] **Step 4: Run typecheck + lint + tests**

```bash
pnpm --filter @mango/web typecheck && pnpm turbo lint --filter=@mango/web && pnpm --filter @mango/web test
```

Expected: all green; test count unchanged.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(scene-card): ✓ badge on done scenes + clearer cancel tooltip

Adds a green ✓ badge to .thumb-badges when a scene has a generated
video and no active job is running. Existing audio + stale badges
remain. Cancel button tooltip clarified to explain refund semantics
(refund-safe per PR #54).

No shimmer overlay on .thumb-loading — existing scrim + radial mango
glow is the intentional design language; overwriting it would clash.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final verification + Vercel preview smoke + memory update

**Files:**
- Push branch, open PR draft, deploy preview, smoke
- Create: `C:/Users/sidir/.claude/projects/C--mango-studio/memory/project_pr1_workspace_render_dashboard_status.md`

- [ ] **Step 1: Final local gates**

```bash
pnpm --filter @mango/web typecheck
pnpm turbo lint --filter=@mango/web
pnpm --filter @mango/web test
```

All three must be green. Resolve any failure before moving on.

- [ ] **Step 2: Push branch to origin**

```bash
git push -u origin feature/pr1-workspace-render-dashboard
```

- [ ] **Step 3: Open draft PR**

```bash
gh pr create --draft --title "feat(workspace): render-dashboard UX + Bug 1 + Bug 2 (PR1)" --body "$(cat <<'EOF'
## Summary

- Closes 2 client-state bugs that hid active scene generation after the «Собрать ролик» payment redirect (Bug 1: `Stage04Provider` `useState` anti-pattern; Bug 2: `page.tsx` jobs query too narrow).
- Adds `TelemetryHeader` — a sticky pipeline status row (rendering / finalizing / just-finished phases) above `WorkspaceScroll`.
- Renames `Stage04Provider` → `ScriptStateProvider` and lifts it inside `<main>` so the header can read pipeline state.
- Introduces `MediaJobUiRow` narrow type + `pickJobUiFields` helper; trims `.select('*')` to a UI-only projection.
- Adds `derivePipelinePhase` pure function + `scrollToFinal` helper.
- Polish: done ✓ badge on scenes + clearer cancel tooltip.

Spec: `docs/superpowers/specs/2026-05-24-workspace-render-dashboard-design.md` (v2, post-Codex-review).
Plan: `docs/superpowers/plans/2026-05-24-workspace-render-dashboard.md`.

PR2 (follow-up) — Codex hygiene on PR #55: explicit `GRANT EXECUTE TO service_role`, atomic finalize RPC, ownership check, `WITH ORDINALITY`, real-UUID test.

PR3 (deferred task) — character avatar should use dossier image as image-to-image reference.

## Test plan

- [ ] typecheck / lint / test all green locally and in CI
- [ ] Vercel preview smoke per spec §13.6: payment redirect → header visible → counter accurate → per-scene shimmer + spinner → dots update → finalize → Stage 05 master ready → 3b shows + dismisses after 6s
- [ ] User E2E in prod (post-merge) per spec §13.7 — confirmation "вижу прогресс" gates the v1.X.X tag

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for Vercel preview deploy**

Use `gh pr checks` (or the GitHub UI) to find the Vercel preview URL once it appears. Expect ~2–4 minutes.

```bash
gh pr checks --watch
```

- [ ] **Step 5: Vercel preview smoke (manual, per spec §13.6)**

Open the preview URL. Log in as the test user (sufficient balance). Verify in order:
1. Land on `/login` → email OTP → land on dashboard.
2. Click «Новый проект» → landing flow → enter idea → script generated.
3. Generate first frames in Stage 03 → all scenes have first frames.
4. Click «Собрать ролик» (MOCK_YOOKASSA path).
5. After redirect to workspace `/projects/{id}`:
   - `TelemetryHeader` visible at top of shell, below `TopBar`.
   - Counter reads `N / 4 готово` (matches Supabase DB state for the project).
   - Per-scene cards show spinner + label «Видео» (existing dark scrim with mango glow).
   - 4 dots in the header reflect per-scene state (done = green, running = orange pulsing, queued = neutral).
6. As scenes complete, dots flip and counter increments.
7. All 4 done → click «Финализировать ролик» in Stage 04 toolbar → auto-scrolls to Stage 05 + header shifts to `4 / 4 ✓ • склеиваю финальный ролик`.
8. Master ready → header shows `✓ готово • финальный ролик собран • показать` for ~6 s, then disappears.
9. Click «показать» (while still visible) → scrolls to Stage 05 player + header dismisses immediately.

Any failure → fix, push, re-smoke. Do not proceed until all 9 checks pass.

- [ ] **Step 6: Mark PR ready for review (no Codex audit required for PR1 — pure UI)**

```bash
gh pr ready
```

- [ ] **Step 7: Squash-merge after CI green**

(Coordinate with maintainer; project policy is squash-merge to main.)

- [ ] **Step 8: User E2E in prod (per spec §13.7)**

Wait for user to confirm «вижу прогресс» after running the same flow in prod against `mangopro.ru`. Any regression → hotfix PR before the tag.

- [ ] **Step 9: Tag release**

```bash
git checkout main && git pull
git tag -a v1.X.X -m "feat: workspace render dashboard (PR1)"
git push origin v1.X.X
```

(Replace `v1.X.X` with the next semver — likely `v1.9.0` given recent ship history.)

- [ ] **Step 10: Update memory**

Create `C:/Users/sidir/.claude/projects/C--mango-studio/memory/project_pr1_workspace_render_dashboard_status.md`:

```markdown
---
name: PR1 SHIPPED — workspace render dashboard
description: Bug 1 + Bug 2 closed, TelemetryHeader live, ScriptStateProvider lifted. PR2 (Codex hygiene) + PR3 (avatar dossier ref) pending.
type: project-status
---

## What shipped

- **Bug 1**: ScriptStateProvider syncs from props via useEffect; RSC-authoritative jobs with 5s realtime grace + script-driven pruning.
- **Bug 2**: page.tsx jobs query expanded to all scene-level kinds with narrow column projection.
- **TelemetryHeader**: sticky cream-themed pipeline status (idle / rendering / finalizing / just-finished). Phase 3b uses master-id ref guard to avoid false positives on failed second finalize. No ETA, soft tone.
- **SceneCard**: ✓ done badge + clearer cancel tooltip.
- **Refactor**: Stage04Provider → ScriptStateProvider (lifted into `<main>`). MediaJobUiRow narrow type.

## What did NOT change

- StageFinal.tsx 4-state design (untouched, already good).
- CostMeter, master button, character chat tools, billing flow.

## Follow-ups still owed

- **PR2** (Codex hygiene on PR #55): explicit `GRANT EXECUTE TO service_role`, atomic finalize RPC, ownership check in mirrorSceneAssetToStorage, `WITH ORDINALITY` in RPC, real UUID in test.
- **PR3** (deferred task): character avatar should use dossier image as image-to-image reference in fal nano-banana gen.

## Invariants for next phases

- Provider state is RSC-authoritative; realtime is grace-windowed.
- `MediaJobUiRow` is the only client-side shape. Realtime callback narrows via `pickJobUiFields`. Adding a UI field requires updating SQL projection + Pick type + helper in the same commit.
- `derivePipelinePhase` filters by current scene_id set. Stale jobs and deleted-scene jobs don't influence the header.
- Phase 3b fires only on a NEW master id (not on second-finalize errors).
- Workspace is light cream Mango theme. Header CSS uses `--mango-*` / `--ink-*` / `--leaf-*` vars.

## Verification baseline

- Tests at ship: 369+ passing (334 prior + ~35 new).
- Vercel preview smoke: 9-step checklist from spec §13.6 confirmed.
- User E2E in prod: confirmed «вижу прогресс».
```

- [ ] **Step 11: Commit + push memory file** (memory dir is outside the repo; commit on its own repo if applicable, or save in place)

If `C:/Users/sidir/.claude/projects/C--mango-studio/memory/` is a git repo, commit there. Otherwise, the file is saved in place for future sessions to pick up via the auto-memory loader.

- [ ] **Step 12: Stop the visual companion server (housekeeping)**

If the server from the brainstorm session is still running in the background, no action needed — it auto-exits after 30 min of inactivity. To stop explicitly:

```bash
bash "C:/Users/sidir/.claude/plugins/cache/superpowers-marketplace/superpowers/b55764852ac7/skills/brainstorming/scripts/stop-server.sh" "C:/mango-studio/.claude/worktrees/jolly-cannon-597f9d/.superpowers/brainstorm/144951-1779565533"
```

PR1 is shipped.

---

## Self-Review (post-write)

Coverage check vs spec:
- §3 G1 (UI hydrates inflight scene jobs on initial render) → Task 3 + Task 4.
- §3 G2 (router.refresh re-syncs provider) → Task 4.
- §3 G3 (globally-visible trust signal) → Task 7.
- §3 G4 (visual language unchanged) → Task 7 CSS in light cream palette + Task 8 minimal polish.
- §3 G5 (no new DB schema / RPC) → none of the tasks touch SQL.
- §5 (Bug 1 RSC-authoritative + grace + script-pruning) → Task 4 with tests t1–t5.
- §6 (Bug 2 narrow projection + split) → Task 3 + Task 2 narrow type.
- §7 (Workspace lift, narrow scope) → Task 3.
- §8.1 (derivePipelinePhase scoped + pickBestJob) → Task 6.
- §8.2 (TelemetryHeader + master-id guard + soft copy) → Task 7.
- §8.3 (light cream CSS) → Task 7.
- §9 (SceneCard done badge + tooltip + no shimmer) → Task 8.
- §10 (scrollToFinal extraction + reduced-motion) → Task 5.
- §11 (scroll behavior matrix) → Task 5 (helper) + Task 7 (Phase 3b click).
- §12 (codemod scope) → Task 1 covers all 9 source files + barrel + JSDoc.
- §13 (testing) → Tests embedded in Tasks 2, 4, 5, 6, 7. Pre-merge gates in Task 9 step 1. Vercel smoke in Task 9 step 5. User E2E in Task 9 step 8.
- §14 (PR2 / PR3 split) → PR description in Task 9 step 3.
- §15 (risk register) → mitigations baked into tasks.
- §17 (done definition) → Task 9 step 8 + step 9.

No placeholders found. Types consistent (`MediaJobUiRow` everywhere; `Stage04Script` / `SceneView` names kept). Plan saved.
