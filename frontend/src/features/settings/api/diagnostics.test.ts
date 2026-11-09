/**
 * Contract for the read-only capability diagnostics wire (spec-38).
 *
 * The decoder is strict: an unknown capability state or a missing remediation
 * must surface as a decode error rather than a silently optimistic screen.
 */
import { describe, expect, it } from 'vitest';

import { DecodeError } from '@/shared/api/decode';
import { decodeSettingsDiagnostics } from './decoders';

const payload = {
    runtime_mode: 'local',
    app_env: 'development',
    providers: [
        {
            id: 'ollama',
            name: 'Ollama (Local)',
            credential_required: false,
            server_credential_configured: false,
            state: 'unverified',
            detail: 'The local Ollama endpoint is configured, but reachability has not been verified.',
            effect: 'Model discovery will fail until Ollama is reachable.',
            remediation: 'Start Ollama and use Test connection in Providers.',
        },
    ],
    embedding: {
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimension: 1536,
        credential_required: true,
        server_credential_configured: false,
        state: 'missing',
        detail: 'The openai embedding provider requires a credential.',
        effect: 'Document ingestion cannot create embeddings.',
        remediation: 'Configure the embedding credential.',
    },
    knowledge: {
        qdrant_configured: true,
        qdrant_credential_configured: false,
        bucket_configured: true,
        state: 'unverified',
        detail: 'Qdrant and the bucket are configured but not contacted.',
        effect: 'Knowledge search may fail if storage is unavailable.',
        remediation: 'Verify storage health.',
    },
    execution: {
        in_process_runner: 'disabled',
        external_worker: 'unknown',
        state: 'disabled',
        detail: 'The in-process turn runner is disabled.',
        effect: 'New turns may remain queued unless a separate worker is running.',
        remediation: 'Start the external worker.',
        liveness_scope: 'GET /health reports liveness only.',
    },
    system_ai: {
        source: 'fallback',
        state: 'failed',
        degraded: true,
        message: 'The saved System AI policy could not be read.',
    },
};

describe('settings diagnostics decoder', () => {
    it('decodes capability states into the feature view', () => {
        const decoded = decodeSettingsDiagnostics(payload, 'diagnostics');

        expect(decoded.runtimeMode).toBe('local');
        expect(decoded.providers[0]).toMatchObject({
            id: 'ollama',
            state: 'unverified',
            credentialRequired: false,
        });
        expect(decoded.embedding).toMatchObject({
            provider: 'openai',
            dimension: 1536,
            state: 'missing',
        });
        expect(decoded.knowledge.qdrantConfigured).toBe(true);
        expect(decoded.execution).toMatchObject({
            inProcessRunner: 'disabled',
            externalWorker: 'unknown',
            state: 'disabled',
        });
        expect(decoded.systemAI).toMatchObject({
            source: 'fallback',
            state: 'failed',
            degraded: true,
        });
    });

    it('rejects an unknown capability state', () => {
        const invalid = {
            ...payload,
            providers: [{ ...payload.providers[0], state: 'maybe' }],
        };

        expect(() => decodeSettingsDiagnostics(invalid, 'diagnostics')).toThrow(
            DecodeError,
        );
    });
});
