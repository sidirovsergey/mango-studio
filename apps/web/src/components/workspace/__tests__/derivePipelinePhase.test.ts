import type { MediaJobUiRow } from '@/lib/pickJobUiFields';
import { describe, expect, it } from 'vitest';
import type { SceneView } from '../ScriptStateProvider';
import { derivePipelinePhase } from '../derivePipelinePhase';

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

  it('11. stale completed + new error for same scene → error wins, no inflight → idle', () => {
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
    expect(phase.kind).toBe('idle');
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
  });

  it('13. first_frame job alone → rendering with doneCount=0', () => {
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
