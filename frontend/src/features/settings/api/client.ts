/**
 * No-sign-in client for settings metadata reads (spec-05).
 *
 * This is a pure server-metadata read: no credential headers are ever
 * attached, and failures surface as plain {@link ApiError}s.
 */
import { requestJson } from '@/shared/api/transport';
import { decodeProvidersEnvironment, type ProvidersEnvironment } from './decoders';

interface RequestInitOptional {
    signal?: AbortSignal;
}

export const settingsClient = {
    getProviders(init: RequestInitOptional = {}): Promise<ProvidersEnvironment> {
        return requestJson<unknown>('/settings/providers', { signal: init.signal }).then((payload) =>
            decodeProvidersEnvironment(payload, 'providers'),
        );
    },
};
