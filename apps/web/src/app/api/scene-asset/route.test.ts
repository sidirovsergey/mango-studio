import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { GET } from './route';

const USER_ID = '7c7c5f3a-1234-4abc-9def-abcdef012345';
const FOREIGN_USER_ID = 'aaaa1111-2222-4abc-9def-bbbbbbbb0000';
const PROJECT_ID = '11223344-5566-4788-99aa-bbccddeeff00';
const VALID_PATH = `${USER_ID}/${PROJECT_ID}/s1/cf9ad3f2-12be-4d3c-b0c6-7277ea1ab8c2-frame.png`;

function makeReq(path?: string | null): Request {
  const url =
    path === null
      ? 'https://x.test/api/scene-asset'
      : `https://x.test/api/scene-asset?path=${encodeURIComponent(path ?? VALID_PATH)}`;
  return new Request(url);
}

function mockUser(id: string | null) {
  if (id === null) {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('not authenticated'),
    );
  } else {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id });
  }
}

function mockSignedUrl(signedUrl: string | null, errorMessage?: string) {
  (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: signedUrl ? { signedUrl } : null,
          error: errorMessage ? { message: errorMessage } : null,
        }),
      })),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/scene-asset', () => {
  it('returns 400 when path query param missing', async () => {
    const res = await GET(makeReq(null));
    expect(res.status).toBe(400);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it('returns 400 on traversal attempt (../)', async () => {
    const res = await GET(makeReq(`${USER_ID}/../etc/passwd`));
    expect(res.status).toBe(400);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 on absolute path', async () => {
    const res = await GET(makeReq('/etc/passwd'));
    expect(res.status).toBe(400);
  });

  it('returns 400 on malformed shape (not <uuid>/<uuid>/<scene>/<file>)', async () => {
    const res = await GET(makeReq('just-a-filename.png'));
    expect(res.status).toBe(400);
  });

  it('returns 401 when caller has no session', async () => {
    mockUser(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 403 when path user_id does not match caller', async () => {
    mockUser(FOREIGN_USER_ID);
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(getServerSupabase).not.toHaveBeenCalled();
  });

  it('returns 302 with signed URL and cacheable header on success', async () => {
    mockUser(USER_ID);
    mockSignedUrl('https://supabase.test/signed?token=abc&expires=123');

    const res = await GET(makeReq());
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://supabase.test/signed?token=abc&expires=123');
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=3300');
  });

  it('returns 404 with no-store when storage signing fails', async () => {
    mockUser(USER_ID);
    mockSignedUrl(null, 'object not found');
    const res = await GET(makeReq());
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
