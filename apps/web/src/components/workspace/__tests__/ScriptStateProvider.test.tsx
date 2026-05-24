import type { MediaJobUiRow } from '@/lib/pickJobUiFields';
import { act, render } from '@testing-library/react';
import { type ReactNode, type RefObject, createRef, forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScriptStateProvider, type Stage04Script, useScriptState } from '../ScriptStateProvider';

type ScriptStateSnapshot = ReturnType<typeof useScriptState>;

const ScriptStateBridge = forwardRef<ScriptStateSnapshot>(function ScriptStateBridge(_, ref) {
  const state = useScriptState();
  useImperativeHandle(ref, () => state, [state]);
  return null;
});

function readState(ref: RefObject<ScriptStateSnapshot | null>): ScriptStateSnapshot {
  if (!ref.current) throw new Error('ScriptStateBridge did not mount');
  return ref.current;
}

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

function makeScene(
  scene_id: string,
  videoActive: string | null = null,
): Stage04Script['scenes'][number] {
  return {
    scene_id,
    description: '',
    dialogue: null,
    character_ids: [],
    duration_sec: 5,
    audio_mode: 'silent',
    first_frame_source: 'generated',
    first_frame_versions: [],
    first_frame_active_version_id: null,
    video_versions: videoActive
      ? [
          {
            version_id: videoActive,
            generated_at: new Date().toISOString(),
            storage: { kind: 'fal_passthrough', url: 'x' },
            has_native_audio: null,
            // biome-ignore lint/suspicious/noExplicitAny: test fixture — SceneAssetVersion has fields irrelevant to these tests
          } as any,
        ]
      : [],
    video_active_version_id: videoActive,
    voice_audio_versions: [],
    voice_audio_active_version_id: null,
    last_frame: null,
    final_clip: null,
    // biome-ignore lint/suspicious/noExplicitAny: test fixture — SceneView has optional fields irrelevant to these tests
  } as any;
}

describe('ScriptStateProvider — Bug 1: re-sync from props', () => {
  it('exposes the new script after initialScript prop changes', () => {
    const v1 = makeScript({ title: 'v1' });
    const v2 = makeScript({ title: 'v2' });
    const stateRef = createRef<ScriptStateSnapshot>();
    const { rerender } = render(
      <ScriptStateProvider projectId="p" initialScript={v1} initialJobs={[]}>
        <ScriptStateBridge ref={stateRef} />
      </ScriptStateProvider>,
    );
    expect(readState(stateRef).script?.title).toBe('v1');
    rerender(
      <ScriptStateProvider projectId="p" initialScript={v2} initialJobs={[]}>
        <ScriptStateBridge ref={stateRef} />
      </ScriptStateProvider>,
    );
    expect(readState(stateRef).script?.title).toBe('v2');
  });
});

describe('ScriptStateProvider — Bug 1: jobs RSC-authoritative + grace + script-pruning', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('t1: realtime row + same row in initialJobs -> single copy', () => {
    const row = makeJob({ id: 'j-1' });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <ScriptStateProvider projectId="p" initialScript={makeScript()} initialJobs={[row]}>
        {children}
      </ScriptStateProvider>
    );
    const stateRef = createRef<ScriptStateSnapshot>();
    render(
      <Wrapper>
        <ScriptStateBridge ref={stateRef} />
      </Wrapper>,
    );
    expect(readState(stateRef).jobs.filter((j) => j.id === 'j-1')).toHaveLength(1);
  });

  it('t2: realtime-only row 10s old + initialJobs=[] + script shows completion -> pruned', () => {
    const oldRow = makeJob({
      id: 'j-2',
      kind: 'video',
      scene_id: 's-1',
      created_at: new Date(Date.now() - 10_000).toISOString(),
    });
    const sceneDone = makeScene('s-1', 'v-1');
    const stateRef = createRef<ScriptStateSnapshot>();
    const initialScript = makeScript({ scenes: [sceneDone] });
    const renderProvider = (jobs: MediaJobUiRow[]) => (
      <ScriptStateProvider projectId="p" initialScript={initialScript} initialJobs={jobs}>
        <ScriptStateBridge ref={stateRef} />
      </ScriptStateProvider>
    );
    const { rerender } = render(renderProvider([]));
    act(() => {
      readState(stateRef).upsertJob(oldRow);
    });
    expect(readState(stateRef).jobs.find((j) => j.id === 'j-2')).toBeDefined();
    rerender(renderProvider([]));
    expect(readState(stateRef).jobs.find((j) => j.id === 'j-2')).toBeUndefined();
  });

  it('t3: realtime-only row 2s old + initialJobs=[] + no completion -> kept (grace)', () => {
    const freshRow = makeJob({
      id: 'j-3',
      kind: 'video',
      scene_id: 's-1',
      created_at: new Date(Date.now() - 2_000).toISOString(),
    });
    const scene = makeScene('s-1');
    const stateRef = createRef<ScriptStateSnapshot>();
    const initialScript = makeScript({ scenes: [scene] });
    const renderProvider = (jobs: MediaJobUiRow[]) => (
      <ScriptStateProvider projectId="p" initialScript={initialScript} initialJobs={jobs}>
        <ScriptStateBridge ref={stateRef} />
      </ScriptStateProvider>
    );
    const { rerender } = render(renderProvider([]));
    act(() => {
      readState(stateRef).upsertJob(freshRow);
    });
    expect(readState(stateRef).jobs.find((j) => j.id === 'j-3')).toBeDefined();
    rerender(renderProvider([]));
    expect(readState(stateRef).jobs.find((j) => j.id === 'j-3')).toBeDefined();
  });

  it('t4: realtime row for unknown scene_id + script has no such scene -> pruned', () => {
    const orphan = makeJob({
      id: 'j-4',
      kind: 'video',
      scene_id: 'S99',
      created_at: new Date().toISOString(),
    });
    const scene = makeScene('s-1');
    const stateRef = createRef<ScriptStateSnapshot>();
    const initialScript = makeScript({ scenes: [scene] });
    const renderProvider = (jobs: MediaJobUiRow[]) => (
      <ScriptStateProvider projectId="p" initialScript={initialScript} initialJobs={jobs}>
        <ScriptStateBridge ref={stateRef} />
      </ScriptStateProvider>
    );
    const { rerender } = render(renderProvider([]));
    act(() => {
      readState(stateRef).upsertJob(orphan);
    });
    expect(readState(stateRef).jobs.find((j) => j.id === 'j-4')).toBeDefined();
    rerender(renderProvider([]));
    expect(readState(stateRef).jobs.find((j) => j.id === 'j-4')).toBeUndefined();
  });

  it('t5: both initialJobs and prev have row X with different status -> initialJobs wins', () => {
    const oldVersion = makeJob({ id: 'j-5', status: 'pending' });
    const newVersion = makeJob({ id: 'j-5', status: 'error' });
    const stateRef = createRef<ScriptStateSnapshot>();
    const initialScript = makeScript();
    const renderProvider = (jobs: MediaJobUiRow[]) => (
      <ScriptStateProvider projectId="p" initialScript={initialScript} initialJobs={jobs}>
        <ScriptStateBridge ref={stateRef} />
      </ScriptStateProvider>
    );
    const { rerender } = render(renderProvider([oldVersion]));
    rerender(renderProvider([newVersion]));
    const j5 = readState(stateRef).jobs.find((j) => j.id === 'j-5');
    expect(j5?.status).toBe('error');
  });
});
