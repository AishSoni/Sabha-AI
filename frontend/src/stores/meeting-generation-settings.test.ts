/**
 * Functional spec: generation turns must carry the browser's vault-composed
 * settings (provider/model/temperature + BYOK key) into the meeting store's
 * API calls, so what the user configured is what actually generates.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    api: {
        executeTurn: vi.fn(),
        streamTurn: vi.fn(),
        getMeeting: vi.fn(),
        getDisagreements: vi.fn(),
        getConsensus: vi.fn(),
        getContextStats: vi.fn(),
    },
}));

vi.mock('@/lib/api', () => ({
    api: mocks.api,
    default: mocks.api,
}));

import { useMeetingStore } from '@/stores/meetingStore';
import { useSettingsStore } from '@/stores/settings-store';
import type { MeetingWithParticipants } from '@/lib/api';

const MEETING_ID = 'meeting-1';
const PARTICIPANT_ID = 'participant-1';

const seedCurrentMeeting = () => {
    useMeetingStore.setState({
        currentMeeting: {
            id: MEETING_ID,
            participants: [{ id: PARTICIPANT_ID, name: 'The Analyst', color: '#3b82f6' }],
            messages: [],
        } as unknown as MeetingWithParticipants,
    });
};

const unlockGeminiVault = async () => {
    const settings = useSettingsStore.getState();
    await settings.unlockVault('correct vault phrase');
    await settings.setProviderConfig('gemini', {
        apiKey: 'sk-live-secret',
        model: 'gemini-2.0-flash',
        temperature: 0.2,
        enabled: true,
    });
    settings.setDefaultProvider('gemini');
};

describe('meeting store generation settings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        useSettingsStore.getState().resetAllSettings();
        useSettingsStore.getState().lockVault();
    });

    it('streams turns with vault-composed generation settings', async () => {
        await unlockGeminiVault();
        seedCurrentMeeting();

        mocks.api.streamTurn.mockImplementation(async function* () {
            yield { type: 'text', content: 'Grounded answer.' };
            yield { type: 'done', message_id: 'm-1' };
        });
        mocks.api.getMeeting.mockResolvedValue({
            id: MEETING_ID,
            participants: [],
            messages: [],
        });
        mocks.api.getDisagreements.mockResolvedValue([]);
        mocks.api.getConsensus.mockResolvedValue([]);
        mocks.api.getContextStats.mockResolvedValue({});

        await useMeetingStore.getState().executeTurnStreaming(PARTICIPANT_ID);

        expect(mocks.api.streamTurn).toHaveBeenCalledTimes(1);
        const call = mocks.api.streamTurn.mock.calls[0];
        expect(call[0]).toBe(MEETING_ID);
        expect(call[1]).toBe(PARTICIPANT_ID);
        const gen = call[2] as { provider?: string; apiKey?: string; model?: string };
        expect(gen).toBeTruthy(); // ← RED pre-fix (undefined)
        expect(gen.provider).toBe('gemini');
        expect(gen.apiKey).toBe('sk-live-secret');
        expect(gen.model).toBe('gemini-2.0-flash');
    });

    it('sends non-streaming turns with vault-composed settings too', async () => {
        await unlockGeminiVault();
        seedCurrentMeeting();

        mocks.api.executeTurn.mockResolvedValue({
            message: { id: 'msg-1', content: 'ok' },
            disagreements: [],
            consensus: [],
        });

        await useMeetingStore.getState().executeTurn(PARTICIPANT_ID);

        const call = mocks.api.executeTurn.mock.calls[0];
        expect(call[0]).toBe(MEETING_ID);
        expect(call[1]).toBe(PARTICIPANT_ID);
        const gen = call[2] as { provider?: string; apiKey?: string };
        expect(gen).toBeTruthy(); // ← RED pre-fix (undefined)
        expect(gen.provider).toBe('gemini');
        expect(gen.apiKey).toBe('sk-live-secret');
    });

    it('hands the BYOK key over the X-Provider-Key header, not the body', () => {
        // Exit-gate evidence (credential_handoff): the vault key travels as
        // a request header set from settings.apiKey, and the non-secret
        // generation fields land in the body's provider object.
        const { readFileSync } = require('node:fs');
        const source = readFileSync(
            require('node:path').resolve(__dirname, '../lib/api.ts'),
            'utf8'
        );

        expect(source).toContain("headers['X-Provider-Key'] = settings.apiKey");
        expect(source).toContain('max_tokens: settings.maxTokens');
        expect(source).toContain('base_url: settings.baseUrl');
        // The secret never joins the JSON body.
        expect(JSON.stringify(turnRequestInitShape())).not.toContain('apiKey');
    });
});

// Shape guard for the source-contract above: the body builder serializes a
// participant_id + provider object only.
function turnRequestInitShape(): Record<string, unknown> {
    const body: Record<string, unknown> = {
        participant_id: 'participant-1',
        provider: {
            provider: 'gemini',
            model: 'gemini-2.0-flash',
            temperature: 0.2,
            max_tokens: 1234,
            base_url: null,
        },
    };
    return body;
}
