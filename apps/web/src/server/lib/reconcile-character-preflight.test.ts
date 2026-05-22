import type { Character } from '@mango/core';
import { describe, expect, it, vi } from 'vitest';
import {
  type CharacterPreflightDeps,
  reconcileCharacterPreflight,
} from './reconcile-character-preflight';

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CHAR_FINN = '7c7c5f3a-1234-4abc-9def-abcdef012345';
const CHAR_OCTO = '11223344-5566-4788-99aa-bbccddeeff00';

function mkChar(
  id: string,
  name: string,
  opts: { dossier?: boolean; refImage?: boolean } = {},
): Character {
  return {
    id,
    name,
    description: 'test',
    full_prompt: '',
    appearance: {},
    personality: '',
    voice: {},
    reference_images: [],
    archived: false,
    dossier: opts.dossier
      ? {
          storage: { kind: 'fal_passthrough', url: `https://cdn.fal.ai/${id}-dossier.png` },
          model: 'fal-ai/nano-banana-pro',
          format: '16:9',
          quality: '1080p',
          generated_at: '2026-01-01T00:00:00Z',
          ...(opts.refImage
            ? {
                reference_image: {
                  kind: 'fal_passthrough',
                  url: `https://cdn.fal.ai/${id}-ref.png`,
                },
              }
            : {}),
        }
      : undefined,
  } as Character;
}

function makeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function makeDeps(overrides: Partial<CharacterPreflightDeps> = {}): {
  deps: CharacterPreflightDeps;
  clock: ReturnType<typeof makeClock>;
} {
  const clock = makeClock();
  const deps: CharacterPreflightDeps = {
    readCharacters: vi.fn().mockResolvedValue({ ok: true, characters: [] }),
    submitDossier: vi.fn().mockResolvedValue({ ok: true, job_id: 'job-1' }),
    poll: vi.fn().mockResolvedValue({ ok: true }),
    sleep: vi.fn(async (ms: number) => {
      clock.advance(ms);
    }),
    now: () => clock.now(),
    ...overrides,
  };
  return { deps, clock };
}

describe('reconcileCharacterPreflight', () => {
  it('returns no_op when project has no characters', async () => {
    const { deps } = makeDeps({
      readCharacters: vi.fn().mockResolvedValue({ ok: true, characters: [] }),
    });
    const result = await reconcileCharacterPreflight({ project_id: PROJECT_ID }, deps);
    expect(result.status).toBe('no_op');
    if (result.status === 'no_op') expect(result.reason).toBe('no_characters');
    expect(deps.submitDossier).not.toHaveBeenCalled();
    expect(deps.poll).not.toHaveBeenCalled();
  });

  it('returns no_op when every character already has reference_image (re-run case)', async () => {
    const { deps } = makeDeps({
      readCharacters: vi.fn().mockResolvedValue({
        ok: true,
        characters: [
          mkChar(CHAR_FINN, 'Финн', { dossier: true, refImage: true }),
          mkChar(CHAR_OCTO, 'Осьминог', { dossier: true, refImage: true }),
        ],
      }),
    });
    const result = await reconcileCharacterPreflight({ project_id: PROJECT_ID }, deps);
    expect(result.status).toBe('no_op');
    if (result.status === 'no_op') expect(result.reason).toBe('all_ready');
    expect(deps.submitDossier).not.toHaveBeenCalled();
    expect(deps.poll).not.toHaveBeenCalled();
  });

  it('submits dossier only for characters missing dossier.storage', async () => {
    // Финн has no dossier, Осьминог has dossier but no ref_image (F53 chain
    // will handle ref_image without manual submit).
    const characters = [
      mkChar(CHAR_FINN, 'Финн'),
      mkChar(CHAR_OCTO, 'Осьминог', { dossier: true, refImage: true }),
    ];
    const { deps } = makeDeps({
      readCharacters: vi.fn().mockResolvedValue({ ok: true, characters }),
      poll: vi.fn().mockResolvedValue({ ok: true }),
    });
    // After preflight submit, simulate quick completion so loop exits.
    (deps.readCharacters as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      characters,
    });
    (deps.readCharacters as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      characters: [
        mkChar(CHAR_FINN, 'Финн', { dossier: true, refImage: true }),
        mkChar(CHAR_OCTO, 'Осьминог', { dossier: true, refImage: true }),
      ],
    });

    const result = await reconcileCharacterPreflight({ project_id: PROJECT_ID }, deps);

    expect(deps.submitDossier).toHaveBeenCalledTimes(1);
    expect(deps.submitDossier).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
      character_id: CHAR_FINN,
    });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.submitted_character_ids).toEqual([CHAR_FINN]);
      expect(result.ready_count).toBe(2);
    }
  });

  it('passes skipReferenceRecovery: false on every poll tick (F53 chain stays armed)', async () => {
    const characters = [mkChar(CHAR_FINN, 'Финн')];
    const { deps } = makeDeps({
      readCharacters: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, characters }) // initial probe
        .mockResolvedValueOnce({ ok: true, characters }) // tick 1: still not ready
        .mockResolvedValueOnce({
          ok: true,
          characters: [mkChar(CHAR_FINN, 'Финн', { dossier: true, refImage: true })],
        }), // tick 2: done
    });

    const result = await reconcileCharacterPreflight({ project_id: PROJECT_ID }, deps);

    expect(result.status).toBe('completed');
    for (const call of (deps.poll as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).toEqual({
        project_id: PROJECT_ID,
        skipReferenceRecovery: false,
      });
    }
  });

  it('returns poll_failed when poll returns ok:false', async () => {
    const characters = [mkChar(CHAR_FINN, 'Финн')];
    const { deps } = makeDeps({
      readCharacters: vi.fn().mockResolvedValue({ ok: true, characters }),
      poll: vi.fn().mockResolvedValue({ ok: false, error: 'unauthorized' }),
    });
    const result = await reconcileCharacterPreflight({ project_id: PROJECT_ID }, deps);
    expect(result.status).toBe('poll_failed');
    if (result.status === 'poll_failed') {
      expect(result.error).toBe('unauthorized');
    }
  });

  it('returns script_unavailable on initial readCharacters failure', async () => {
    const { deps } = makeDeps({
      readCharacters: vi.fn().mockResolvedValue({ ok: false, error: 'db down' }),
    });
    const result = await reconcileCharacterPreflight({ project_id: PROJECT_ID }, deps);
    expect(result.status).toBe('script_unavailable');
    if (result.status === 'script_unavailable') {
      expect(result.error).toBe('db down');
    }
  });

  it('returns budget_exceeded with missing_character_ids when characters never ready', async () => {
    const characters = [mkChar(CHAR_FINN, 'Финн'), mkChar(CHAR_OCTO, 'Осьминог')];
    const { deps } = makeDeps({
      readCharacters: vi.fn().mockResolvedValue({ ok: true, characters }),
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await reconcileCharacterPreflight({ project_id: PROJECT_ID }, deps, {
      initial_delay_ms: 0,
      poll_interval_ms: 50,
      budget_ms: 100,
    });

    expect(result.status).toBe('budget_exceeded');
    if (result.status === 'budget_exceeded') {
      expect(result.missing_character_ids).toEqual([CHAR_FINN, CHAR_OCTO]);
      expect(result.ready_count).toBe(0);
    }
    warnSpy.mockRestore();
  });

  it('continues ticking when poll throws transiently', async () => {
    const characters = [mkChar(CHAR_FINN, 'Финн')];
    const poll = vi
      .fn()
      .mockRejectedValueOnce(new Error('fal blip'))
      .mockResolvedValueOnce({ ok: true });
    const readCharacters = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, characters }) // initial
      .mockResolvedValueOnce({
        ok: true,
        characters: [mkChar(CHAR_FINN, 'Финн', { dossier: true, refImage: true })],
      }); // after recovered tick
    const { deps } = makeDeps({ readCharacters, poll });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await reconcileCharacterPreflight({ project_id: PROJECT_ID }, deps);

    expect(result.status).toBe('completed');
    expect(poll).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('logs and continues when submitDossier throws for one character (other characters proceed)', async () => {
    const characters = [mkChar(CHAR_FINN, 'Финн'), mkChar(CHAR_OCTO, 'Осьминог')];
    const submitDossier = vi
      .fn()
      .mockRejectedValueOnce(new Error('fal submit blew up'))
      .mockResolvedValueOnce({ ok: true, job_id: 'job-octo' });
    const { deps } = makeDeps({
      readCharacters: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, characters })
        .mockResolvedValueOnce({
          ok: true,
          characters: [
            mkChar(CHAR_FINN, 'Финн', { dossier: true, refImage: true }),
            mkChar(CHAR_OCTO, 'Осьминог', { dossier: true, refImage: true }),
          ],
        }),
      submitDossier,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await reconcileCharacterPreflight({ project_id: PROJECT_ID }, deps);

    expect(submitDossier).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      // The throw'd character is NOT in submitted_character_ids.
      expect(result.submitted_character_ids).toEqual([CHAR_OCTO]);
    }
    warnSpy.mockRestore();
  });
});
