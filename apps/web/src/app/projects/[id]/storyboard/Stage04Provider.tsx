'use client';

import type { Database } from '@mango/db';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { Scene as CoreScene } from '@mango/core';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

type SceneWithOverrides = CoreScene & { config_overrides?: { model?: string } };

interface Stage04State {
  script: { title: string; scenes: SceneWithOverrides[]; characters: unknown[] } | null;
  jobs: MediaJobRow[];
  setScript: (
    script: { title: string; scenes: SceneWithOverrides[]; characters: unknown[] } | null,
  ) => void;
  upsertJob: (job: MediaJobRow) => void;
  removeJob: (jobId: string) => void;
}

const Stage04Context = createContext<Stage04State | null>(null);

interface Props {
  initialScript: { title: string; scenes: SceneWithOverrides[]; characters: unknown[] } | null;
  initialJobs: MediaJobRow[];
  children: React.ReactNode;
}

export function Stage04Provider({ initialScript, initialJobs, children }: Props) {
  const [script, setScript] = useState(initialScript);
  const [jobs, setJobs] = useState<MediaJobRow[]>(initialJobs);

  const upsertJob = useCallback((job: MediaJobRow) => {
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
    () => ({ script, jobs, setScript, upsertJob, removeJob }),
    [script, jobs, upsertJob, removeJob],
  );

  return <Stage04Context.Provider value={value}>{children}</Stage04Context.Provider>;
}

export function useStage04(): Stage04State {
  const ctx = useContext(Stage04Context);
  if (!ctx) throw new Error('useStage04 must be used inside Stage04Provider');
  return ctx;
}
