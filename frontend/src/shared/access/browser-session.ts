/**
 * The only browser module allowed to import the Supabase SDK (spec-22).
 *
 * It exposes authentication operations plus the current access token. It
 * never exposes a database, storage, RPC or provider client, and it never
 * accepts or persists the Sabha provider-vault passphrase.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY = 'sabha-operator-auth';

export class AccessConfigurationError extends Error {
    constructor(message = 'Operator sign-in is not configured.') {
        super(message);
        this.name = 'AccessConfigurationError';
    }
}

/** Bad email/password. The message is deliberately generic. */
export class AccessSignInError extends Error {
    constructor() {
        super('Email or password is incorrect.');
        this.name = 'AccessSignInError';
    }
}

/** Supabase Auth could not be reached or answered safely. */
export class AuthServiceUnavailable extends Error {
    constructor() {
        super('Sign-in is temporarily unavailable. Try again.');
        this.name = 'AuthServiceUnavailable';
    }
}

export interface AuthStateChange {
    event: string;
    hasSession: boolean;
}

type AuthClient = SupabaseClient;

let clientPromise: Promise<AuthClient> | null = null;

function authSettings(): { url: string; key: string } {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!url || !key) {
        throw new AccessConfigurationError();
    }
    return { url, key };
}

export function isAuthConfigured(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    );
}

export async function getAuthClient(): Promise<AuthClient> {
    if (!clientPromise) {
        const { url, key } = authSettings();
        clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
            createClient(url, key, {
                auth: {
                    storageKey: STORAGE_KEY,
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: false,
                },
            })
        );
    }
    return clientPromise;
}

/** True when a locally restored/active SDK session exists. */
export async function hasLocalSession(): Promise<boolean> {
    const client = await getAuthClient();
    const { data, error } = await client.auth.getSession();
    if (error) {
        throw new AuthServiceUnavailable();
    }
    return Boolean(data.session);
}

/** Current access token, refreshed by the SDK when necessary. */
export async function getAccessToken(): Promise<string | null> {
    const client = await getAuthClient();
    const { data, error } = await client.auth.getSession();
    if (error) {
        throw new AuthServiceUnavailable();
    }
    return data.session?.access_token ?? null;
}

/** Email/password sign-in through the configured Supabase project. */
export async function signInWithPassword(
    email: string,
    password: string
): Promise<string> {
    const client = await getAuthClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
        const status = (error as { status?: number }).status;
        if (status === 400 || status === 401) {
            throw new AccessSignInError();
        }
        throw new AuthServiceUnavailable();
    }
    const token = data.session?.access_token;
    if (!token) {
        throw new AccessSignInError();
    }
    return token;
}

/**
 * End the managed Auth session. Remote revocation is best-effort: the local
 * session is cleared even if the network is down so the next page load
 * starts signed out.
 */
export async function signOutEverywhere(): Promise<void> {
    const client = await getAuthClient();
    try {
        const { error } = await client.auth.signOut({ scope: 'global' });
        if (!error) {
            return;
        }
    } catch {
        // Fall through to local clear.
    }
    try {
        await client.auth.signOut({ scope: 'local' });
    } catch {
        // The caller already ended the in-memory access scope.
    }
}

/**
 * Subscribe to SDK auth lifecycle events, including cross-tab sign-out.
 * Returns an unsubscribe function; no token is ever included in the event.
 */
export async function subscribeToAuth(
    listener: (change: AuthStateChange) => void
): Promise<() => void> {
    const client = await getAuthClient();
    const { data } = client.auth.onAuthStateChange((event, session) => {
        listener({ event, hasSession: Boolean(session) });
    });
    return () => data.subscription.unsubscribe();
}
