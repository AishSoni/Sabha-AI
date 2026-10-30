import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { beginAccess, endAccess, getAccessSnapshot } from './lifecycle';
import {
    assertLivePath,
    LiveTransportConfigurationError,
    requestLiveBytes,
    requestLiveForm,
    requestLiveJson,
    setLiveAccessTokenSource,
} from './live-transport';

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

describe('live transport path and origin rules', () => {
    it('accepts every live namespace', () => {
        for (const path of [
            '/meetings',
            '/meetings/abc/turns',
            '/documents/upload',
            '/knowledge_stacks/abc',
            '/personas/abc',
            '/settings/providers',
            '/access/session',
        ]) {
            expect(() => assertLivePath(path)).not.toThrow();
        }
    });

    it('rejects replay, public and traversal paths', () => {
        for (const path of [
            '/replay/session',
            '/replay/assets/abc',
            '/health',
            'https://evil.example/meetings',
            '//evil.example/meetings',
            '/meetings/../replay',
            '/meetings/%2e%2e/replay',
            '/meetings\\..\\replay',
            'meetings',
        ]) {
            expect(() => assertLivePath(path), path).toThrow(
                LiveTransportConfigurationError
            );
        }
    });
});

describe('authenticated live requests', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.sabha.example/api');
        fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
        vi.stubGlobal('fetch', fetchMock);
        setLiveAccessTokenSource(async () => 'access-token');
        beginAccess();
    });

    afterEach(() => {
        endAccess('signed_out');
        setLiveAccessTokenSource(null);
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('attaches the bearer only to the configured live origin', async () => {
        await requestLiveJson('/meetings');

        const [input, init] = fetchMock.mock.calls[0];
        expect(input).toBe('https://api.sabha.example/api/meetings');
        expect(init.headers.get('authorization')).toBe('Bearer access-token');
        expect(init.credentials).toBe('omit');
        expect(init.redirect).toBe('error');
        expect(String(input)).not.toContain('access-token');
    });

    it('never sets Content-Type for multipart and still attaches bearer', async () => {
        await requestLiveForm('/documents/upload', new FormData());

        const [, init] = fetchMock.mock.calls[0];
        expect(init.headers.get('authorization')).toBe('Bearer access-token');
        expect(init.headers.get('content-type')).toBeNull();
    });

    it('supports authenticated byte reads and stream opens', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(new Uint8Array([1, 2, 3]), {
                status: 200,
                headers: { 'content-type': 'application/pdf' },
            })
        );
        const bytes = await requestLiveBytes('/documents/a/revisions/b/content');
        expect(bytes.bytes).toEqual(new Uint8Array([1, 2, 3]));
        expect(fetchMock.mock.calls[0][1].headers.get('authorization')).toBe(
            'Bearer access-token'
        );
    });

    it('ends admission on 401 and rejects subsequent work', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Operator authentication required' }, 401));

        await expect(requestLiveJson('/meetings')).rejects.toMatchObject({
            status: 401,
        });
        expect(getAccessSnapshot().active).toBe(false);
        expect(getAccessSnapshot().reason).toBe('token_invalid');

        fetchMock.mockClear();
        await expect(requestLiveJson('/meetings')).rejects.toMatchObject({
            kind: 'aborted',
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('ends admission only for the exact operator-denial 403', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ detail: 'Operator access denied' }, 403)
        );
        await expect(requestLiveJson('/meetings')).rejects.toMatchObject({ status: 403 });
        expect(getAccessSnapshot().reason).toBe('operator_denied');

        beginAccess();
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ detail: 'Meeting is closed' }, 403)
        );
        await expect(requestLiveJson('/meetings')).rejects.toMatchObject({ status: 403 });
        expect(getAccessSnapshot().active).toBe(true);
    });

    it('treats auth outage as retryable, not as sign-out', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ detail: 'Access verification unavailable' }, 503)
        );
        await expect(requestLiveJson('/meetings')).rejects.toMatchObject({ status: 503 });
        expect(getAccessSnapshot().active).toBe(true);
    });

    it('drops a response that finishes after the epoch ended', async () => {
        let resolveFetch: (response: Response) => void = () => {};
        fetchMock.mockImplementationOnce(
            () =>
                new Promise<Response>((resolve) => {
                    resolveFetch = resolve;
                })
        );

        const pending = requestLiveJson('/meetings');
        endAccess('signed_out');
        resolveFetch(jsonResponse({ leaked: true }));

        await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
    });

    it('does not dispatch when no token is available', async () => {
        setLiveAccessTokenSource(async () => null);
        await expect(requestLiveJson('/meetings')).rejects.toMatchObject({
            kind: 'aborted',
        });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(getAccessSnapshot().reason).toBe('token_invalid');
    });

    it('rejects an http base outside localhost', () => {
        vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.sabha.example/api');
        expect(() => requestLiveJson('/meetings')).toThrow(
            LiveTransportConfigurationError
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
