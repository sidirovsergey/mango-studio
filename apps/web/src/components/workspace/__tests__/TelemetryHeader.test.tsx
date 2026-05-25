import type { MediaJobUiRow } from '@/lib/pickJobUiFields';
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScriptStateProvider, type Stage04Script } from '../ScriptStateProvider';
import { TelemetryHeader } from '../TelemetryHeader';

vi.mock('@/lib/scroll-to-final', () => ({
  scrollToFinal: vi.fn(),
}));
import { scrollToFinal } from '@/lib/scroll-to-final';

function scriptFixture(
  opts: {
    scenes?: number;
    doneIndices?: number[];
    masterId?: string | null;
  } = {},
): Stage04Script {
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
        ? [
            {
              version_id: `v${i}`,
              generated_at: new Date().toISOString(),
              storage: { kind: 'fal_passthrough', url: 'x' },
              has_native_audio: null,
              // biome-ignore lint/suspicious/noExplicitAny: test fixture
            } as any,
          ]
        : [],
      video_active_version_id: done.has(i) ? `v${i}` : null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      last_frame: null,
      final_clip: null,
      // biome-ignore lint/suspicious/noExplicitAny: test fixture for SceneView[]
    })) as any,
    master_clip_versions: opts.masterId
      ? [
          {
            version_id: opts.masterId,
            // Generated 1 minute in the future so the timestamp-based prune
            // in isContradictedByScript treats this master as newer than any
            // job created via the `job` fixture (which defaults to NOW).
            // This reflects the real-world ordering: when M1 lands in the
            // script via router.refresh, M1.generated_at > job.created_at.
            generated_at: new Date(Date.now() + 60_000).toISOString(),
            storage: { kind: 'fal_passthrough', url: 'x' },
            composed_from_scene_versions: [],
            has_full_audio: true,
            // biome-ignore lint/suspicious/noExplicitAny: test fixture for MasterClipVersion
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

function Wrap({
  script,
  jobs,
  children,
}: {
  script: Stage04Script;
  jobs: MediaJobUiRow[];
  children: ReactNode;
}) {
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

  it('finalizing phase → "M / M ✓", finalize copy', () => {
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
    const completedScript = scriptFixture({ scenes: 1, doneIndices: [0], masterId: 'M1' });
    act(() => {
      rerender(
        <Wrap script={completedScript} jobs={[]}>
          <TelemetryHeader />
        </Wrap>,
      );
    });
    expect(screen.getByText('финальный ролик собран')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /перейти к финальному ролику/i }),
    ).toBeInTheDocument();

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
    rerender(
      <Wrap script={existing} jobs={[]}>
        <TelemetryHeader />
      </Wrap>,
    );
    expect(screen.queryByText('финальный ролик собран')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('cold mount with master already ready → no Phase 3b', () => {
    render(
      <Wrap script={scriptFixture({ scenes: 1, doneIndices: [0], masterId: 'M1' })} jobs={[]}>
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
    act(() => {
      rerender(
        <Wrap script={scriptFixture({ scenes: 1, doneIndices: [0], masterId: 'M9' })} jobs={[]}>
          <TelemetryHeader />
        </Wrap>,
      );
    });
    const btn = screen.getByRole('button', { name: /перейти/i });
    act(() => {
      btn.click();
    });
    expect(scrollToFinal).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('финальный ролик собран')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('role="status" and aria-live="polite" on the root', () => {
    render(
      <Wrap
        script={scriptFixture({ scenes: 1 })}
        jobs={[job({ id: 'j', scene_id: 's1', status: 'pending' })]}
      >
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

  it('flow animation class present in rendering', () => {
    render(
      <Wrap
        script={scriptFixture({ scenes: 1 })}
        jobs={[job({ scene_id: 's1', status: 'pending' })]}
      >
        <TelemetryHeader />
      </Wrap>,
    );
    expect(document.querySelector('.telemetry-prog-flow')).toBeTruthy();
  });
});
