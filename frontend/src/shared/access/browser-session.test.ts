import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({ createClient }));

function authClient(overrides: Record<string, unknown> = {}) {
    const auth = {
        signInWithPassword: vi.fn(),
        signOut: vi.fn(async () => ({ error: null })),
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({
            data: { subscription: { unsubscribe: vi.fn() } },
        })),
        ...overrides,
    };
    return { auth };
}

async function loadModule() {
    vi.resetModules();
    return import('./browser-session');
}

describe('browser Auth adapter', () => {
    beforeEach(() => {
        createClient.mockReset();
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-key');
    });

    it('creates one managed client with a dedicated storage namespace', async () => {
        const client = authClient();
        createClient.mockReturnValue(client);
        const session = await loadModule();

        await session.getAuthClient();
        await session.getAuthClient();

        expect(createClient).toHaveBeenCalledTimes(1);
        expect(createClient).toHaveBeenCalledWith(
            'https://project.supabase.co',
            'publishable-key',
            {
                auth: {
                    storageKey: 'sabha-operator-auth',
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: false,
                },
            }
        );
        // The adapter never exposes database/storage/RPC clients.
        expect(Object.keys(client)).toEqual(['auth']);
    });

    it('reports missing configuration lazily', async () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
        const session = await loadModule();

        expect(session.isAuthConfigured()).toBe(false);
        await expect(session.getAuthClient()).rejects.toBeInstanceOf(
            session.AccessConfigurationError
        );
    });

    it('maps bad credentials to a generic sign-in error', async () => {
        const client = authClient({
            signInWithPassword: vi.fn(async () => ({
                data: { session: null },
                error: { status: 400, message: 'Invalid login credentials' },
            })),
        });
        createClient.mockReturnValue(client);
        const session = await loadModule();

        await expect(
            session.signInWithPassword('operator@example.com', 'wrong')
        ).rejects.toBeInstanceOf(session.AccessSignInError);
    });

    it('maps Auth outages separately from bad credentials', async () => {
        const client = authClient({
            signInWithPassword: vi.fn(async () => ({
                data: { session: null },
                error: { status: 503, message: 'upstream unavailable' },
            })),
        });
        createClient.mockReturnValue(client);
        const session = await loadModule();

        await expect(
            session.signInWithPassword('operator@example.com', 'secret')
        ).rejects.toBeInstanceOf(session.AuthServiceUnavailable);
    });

    it('returns the SDK access token after sign-in', async () => {
        const client = authClient({
            signInWithPassword: vi.fn(async () => ({
                data: { session: { access_token: 'token-1' } },
                error: null,
            })),
        });
        createClient.mockReturnValue(client);
        const session = await loadModule();

        await expect(
            session.signInWithPassword('operator@example.com', 'secret')
        ).resolves.toBe('token-1');
    });

    it('falls back to a local sign-out when remote revocation fails', async () => {
        const signOut = vi
            .fn()
            .mockResolvedValueOnce({ error: { message: 'offline' } })
            .mockResolvedValueOnce({ error: null });
        createClient.mockReturnValue(authClient({ signOut }));
        const session = await loadModule();

        await session.signOutEverywhere();

        expect(signOut.mock.calls[0][0]).toEqual({ scope: 'global' });
        expect(signOut.mock.calls[1][0]).toEqual({ scope: 'local' });
    });
});
