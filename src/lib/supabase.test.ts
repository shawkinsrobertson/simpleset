import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const fakeClient = { auth: { getSession } };

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => fakeClient),
}));

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('isSupabaseConfigured', () => {
  it('is true when both env vars are set', async () => {
    const { isSupabaseConfigured } = await import('./supabase');
    expect(isSupabaseConfigured()).toBe(true);
  });

  it('is false when the anon key is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { isSupabaseConfigured } = await import('./supabase');
    expect(isSupabaseConfigured()).toBe(false);
  });

  it('is false when the url is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    const { isSupabaseConfigured } = await import('./supabase');
    expect(isSupabaseConfigured()).toBe(false);
  });
});

describe('requireSession', () => {
  it('returns true and does not navigate when a session exists', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'x' } } });
    const { requireSession } = await import('./supabase');
    const navigate = vi.fn();

    const ok = await requireSession(navigate, '/import');

    expect(ok).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates to /auth with returnTo and returns false when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { requireSession } = await import('./supabase');
    const navigate = vi.fn();

    const ok = await requireSession(navigate, '/import');

    expect(ok).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/auth?returnTo=%2Fimport');
  });

  it('navigates to /auth without calling Supabase when it is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    const { requireSession } = await import('./supabase');
    const navigate = vi.fn();

    const ok = await requireSession(navigate, '/import');

    expect(ok).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/auth?returnTo=%2Fimport');
    expect(getSession).not.toHaveBeenCalled();
  });
});
