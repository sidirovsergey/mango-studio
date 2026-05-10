import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { getProjectCostAction } from './getProjectCostAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const setupSelect = (rows: Array<{ cost_usd: number | null }>) => {
  const eqStatus = vi.fn().mockResolvedValue({ data: rows, error: null });
  const eqUser = vi.fn().mockReturnValue({ eq: eqStatus });
  const eqProject = vi.fn().mockReturnValue({ eq: eqUser });
  const select = vi.fn().mockReturnValue({ eq: eqProject });
  (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    from: vi.fn(() => ({ select })),
  });
};

describe('getProjectCostAction', () => {
  it('sums cost_usd of completed jobs', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    setupSelect([{ cost_usd: 0.05 }, { cost_usd: 0.36 }, { cost_usd: 0.001 }]);

    const r = await getProjectCostAction({ project_id: PROJECT_ID });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cost_usd).toBeCloseTo(0.411, 3);
  });

  it('returns 0 for project with no jobs', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    setupSelect([]);

    const r = await getProjectCostAction({ project_id: PROJECT_ID });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cost_usd).toBe(0);
  });

  it('treats null cost_usd rows as 0', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    setupSelect([{ cost_usd: null }, { cost_usd: 0.5 }]);

    const r = await getProjectCostAction({ project_id: PROJECT_ID });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cost_usd).toBeCloseTo(0.5, 3);
  });
});
