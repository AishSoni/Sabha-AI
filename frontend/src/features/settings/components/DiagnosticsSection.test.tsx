// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    view: {
        data: null as object | null,
        isLoading: false,
        error: null as object | null,
    },
    refetch: vi.fn(),
}));

vi.mock('../api', () => ({
    useSettingsDiagnostics: () => ({
        ...mocks.view,
        refetch: mocks.refetch,
    }),
}));

import { ApiOriginCard, DiagnosticsSection } from './DiagnosticsSection';

const diagnostics = {
    runtimeMode: 'local',
    appEnv: 'development',
    providers: [
        {
            id: 'ollama',
            name: 'Ollama (Local)',
            credentialRequired: false,
            serverCredentialConfigured: false,
            state: 'unverified',
            detail: 'The local Ollama endpoint is configured, but reachability has not been verified.',
            effect: 'Model discovery and local inference will fail until Ollama is reachable.',
            remediation: 'Start Ollama and use Test connection in Providers.',
        },
    ],
    embedding: {
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimension: 1536,
        credentialRequired: true,
        serverCredentialConfigured: false,
        state: 'missing',
        detail: 'The openai embedding provider requires a credential.',
        effect: 'Document ingestion cannot create embeddings.',
        remediation: 'Configure the embedding credential.',
    },
    knowledge: {
        qdrantConfigured: true,
        qdrantCredentialConfigured: false,
        bucketConfigured: true,
        state: 'unverified',
        detail: 'Qdrant and the bucket are configured but not contacted.',
        effect: 'Knowledge search may fail if storage is unavailable.',
        remediation: 'Verify storage health.',
    },
    execution: {
        inProcessRunner: 'disabled',
        externalWorker: 'unknown',
        state: 'disabled',
        detail: 'The in-process turn runner is disabled.',
        effect: 'New turns may remain queued unless a separate worker is running.',
        remediation: 'Start the external worker.',
        livenessScope: 'GET /health reports process liveness only.',
    },
    systemAI: {
        source: 'fallback',
        state: 'failed',
        degraded: true,
        message: 'The saved System AI policy could not be read.',
    },
};

beforeEach(() => {
    vi.clearAllMocks();
    // CI exports NEXT_PUBLIC_API_URL for the production build; keep these
    // assertions independent of the ambient environment.
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    mocks.view.data = null;
    mocks.view.isLoading = false;
    mocks.view.error = null;
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('settings diagnostics section', () => {
    it('shows configuration states and never calls them connected', () => {
        mocks.view.data = diagnostics;

        render(<DiagnosticsSection />);

        expect(screen.getByText('API origin')).toBeTruthy();
        expect(screen.getByText('Read-only')).toBeTruthy();
        expect(screen.getByText(/Runtime mode:/)).toBeTruthy();
        expect(screen.getByText(/local development default/)).toBeTruthy();
        expect(screen.getByText('Ollama (Local)')).toBeTruthy();
        expect(screen.getAllByText('Unverified')).toHaveLength(2);
        expect(screen.getByText('No server credential required')).toBeTruthy();
        expect(screen.getByText('Embedding · openai')).toBeTruthy();
        expect(screen.getByText(/text-embedding-3-small · 1536 dimensions/)).toBeTruthy();
        expect(screen.getByText(/external worker cannot be established/)).toBeTruthy();
        expect(screen.getByText('Source: fallback')).toBeTruthy();
        expect(screen.getByText(/GET \/health reports process liveness only/)).toBeTruthy();
        expect(screen.queryByText('Available')).toBeNull();
    });

    it('shows a retryable failure instead of an empty success', () => {
        mocks.view.error = new Error('boom');

        render(<DiagnosticsSection />);

        expect(screen.getByText('API origin')).toBeTruthy();
        expect(screen.getByText(/local development default/)).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toContain(
            'Failed to load diagnostics'
        );
        fireEvent.click(screen.getByRole('button', { name: /retry/i }));
        expect(mocks.refetch).toHaveBeenCalledTimes(1);
    });

    it('explains a hosted page with no configured API origin', () => {
        vi.stubEnv('NEXT_PUBLIC_API_URL', '');

        render(<ApiOriginCard pageOrigin="https://sabha.example" />);

        expect(screen.getByText('Misconfigured')).toBeTruthy();
        expect(screen.getByText(/NEXT_PUBLIC_API_URL is not set/)).toBeTruthy();
        expect(screen.getByText(/public HTTPS API origin/)).toBeTruthy();
    });
});
