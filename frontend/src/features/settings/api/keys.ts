/**
 * Query keys for the settings feature (spec-05).
 *
 * Keys stay feature-local: no other feature or the transport layer may
 * reference or register these identities.
 */
export const settingsKeys = {
    all: ['settings'] as const,
    providers: () => ['settings', 'providers'] as const,
};
