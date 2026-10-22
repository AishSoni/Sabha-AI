// @vitest-environment happy-dom
/**
 * Regression: the Summary tab builds its list from persisted system-marker
 * messages (never the old canned mock text), the Generate action calls the
 * real summary endpoint with the vault-composed BYOK settings, and endpoint
 * failures surface as a dismissible banner.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    generateSummary: vi.fn(),
    getMeeting: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
    api: mocks,
    default: mocks,
}));

// The closing workflow owns its own suite; the Summary tab only mounts it.
vi.mock('@/features/meetings', () => ({
    ClosingPanel: () => <div data-testid="closing-panel" />,
}));

import { SummaryTab } from '@/components/chat/SummaryTab';
import { useMeetingStore } from '@/stores/meetingStore';
import { useSettingsStore } from '@/stores/settings-store';
import type { Message, MeetingWithParticipants } from '@/lib/api';

const MEETING_ID = 'meeting-summary-1';

const INTERIM = '📋 **MEETING SUMMARY**';
const FINAL = '📋 **MEETING ENDED**';

function systemMessage(id: string, content: string, createdAt: string): Message {
    return {
        id,
        meeting_id: MEETING_ID,
        sender_type: 'system',
        sender_name: 'System',
        sender_id: null,
        content,
        citations: [],
        estimated_cost: 0,
        created_at: createdAt,
    } as unknown as Message;
}

function userMessage(id: string, content: string): Message {
    return {
        id,
        meeting_id: MEETING_ID,
        sender_type: 'user',
        sender_name: 'You',
        sender_id: null,
        content,
        citations: [],
        estimated_cost: 0,
        created_at: '2026-01-01T10:00:00Z',
    } as unknown as Message;
}

function meetingWithMessages(messages: Message[]): MeetingWithParticipants {
    return {
        id: MEETING_ID,
        name: 'Summary Probe',
        agenda: '',
        status: 'active',
        participants: [],
        messages,
    } as unknown as MeetingWithParticipants;
}

function seedMeeting(messages: Message[], status = 'active') {
    act(() => {
        useMeetingStore.setState({
            currentMeeting: { ...meetingWithMessages(messages), status } as MeetingWithParticipants,
        });
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
        useMeetingStore.setState({
            currentMeeting: null,
            isLoading: false,
            error: null,
            activeTurnParticipantId: null,
            streamingMessage: null,
            loadOperation: null,
            turnOperation: null,
        });
    });
    window.localStorage.clear();
    useSettingsStore.getState().resetAllSettings();
    useSettingsStore.getState().lockVault();
});

describe('summary tab', () => {
    it('renders a persisted interim summary instead of mock content', () => {
        const persisted = systemMessage(
            'msg-1',
            `${INTERIM}\n\nMetered pricing wins the debate.`,
            '2026-01-01T10:01:00Z'
        );
        seedMeeting([userMessage('msg-0', 'discuss pricing'), persisted]);

        render(<SummaryTab />);

        expect(screen.getByText('Metered pricing wins the debate.')).toBeInTheDocument();
        // The old canned mock text must be gone from the component entirely.
        expect(
            screen.queryByText(/The Investor raised concerns about market positioning/)
        ).toBeNull();
        expect(screen.getByRole('button', { name: /Generate Summary #2/ })).toBeInTheDocument();
    });

    it('shows the final executive summary with the Final badge', () => {
        const finalMessage = systemMessage(
            'msg-final',
            `${FINAL}\n\nPricing is metered; launch next sprint.`,
            '2026-01-01T10:02:00Z'
        );
        seedMeeting([finalMessage], 'ended');

        render(<SummaryTab />);

        expect(screen.getByText('Pricing is metered; launch next sprint.')).toBeInTheDocument();
        expect(screen.getByText('Final')).toBeInTheDocument();
        const generate = screen.getByRole('button', { name: /Generate Summary #2/ });
        expect(generate).toBeDisabled();    });

    it('generates through the real endpoint and refreshes the derived list', async () => {
        const existing = systemMessage(
            'msg-1',
            `${INTERIM}\n\nFirst synthesis.`,
            '2026-01-01T10:01:00Z'
        );
        seedMeeting([userMessage('msg-0', 'discuss'), existing]);

        const refreshed = meetingWithMessages([
            userMessage('msg-0', 'discuss'),
            existing,
            systemMessage(
                'msg-2',
                `${INTERIM}\n\nSecond synthesis: metered pricing confirmed.`,
                '2026-01-01T10:03:00Z'
            ),
        ]);
        mocks.generateSummary.mockResolvedValue({ id: 'msg-2' });
        mocks.getMeeting.mockResolvedValue(refreshed);

        render(<SummaryTab />);

        fireEvent.click(screen.getByRole('button', { name: /Generate Summary #2/ }));

        await waitFor(() =>
            expect(screen.getByText('Second synthesis: metered pricing confirmed.'))
                .toBeInTheDocument()
        );
        // A composed (non-secret) settings object rides along — actual BYOK
        // capture is asserted in its own test below.
        expect(mocks.generateSummary).toHaveBeenCalledWith(
            MEETING_ID,
            expect.objectContaining({ provider: expect.anything() })
        );
        expect(screen.getByRole('button', { name: /Generate Summary #3/ })).toBeInTheDocument();
    });

    it('passes vault-composed BYOK settings to the summary call', async () => {
        await unlockGeminiVault();
        seedMeeting([userMessage('msg-0', 'discuss')]);

        mocks.generateSummary.mockResolvedValue({ id: 'msg-1' });
        mocks.getMeeting.mockResolvedValue(
            meetingWithMessages([
                userMessage('msg-0', 'discuss'),
                systemMessage('msg-1', `${INTERIM}\n\nKey insight.`, '2026-01-01T10:04:00Z'),
            ])
        );

        render(<SummaryTab />);

        fireEvent.click(screen.getByRole('button', { name: /Generate Summary #1/ }));

        await waitFor(() => expect(mocks.generateSummary).toHaveBeenCalled());
        const [calledMeetingId, calledSettings] = mocks.generateSummary.mock.calls[0];
        expect(calledMeetingId).toBe(MEETING_ID);
        expect(calledSettings).toMatchObject({
            provider: 'gemini',
            model: 'gemini-2.0-flash',
            apiKey: 'sk-live-secret',
        });
    });

    it('surfaces generation failures in a dismissible banner', async () => {
        seedMeeting([userMessage('msg-0', 'discuss')]);
        mocks.generateSummary.mockRejectedValue(new Error('422: no conversation to summarize'));

        render(<SummaryTab />);

        fireEvent.click(screen.getByRole('button', { name: /Generate Summary #1/ }));

        await waitFor(() =>
            expect(screen.getByText(/422: no conversation to summarize/)).toBeInTheDocument()
        );

        fireEvent.click(screen.getByText('Dismiss'));
        await waitFor(() =>
            expect(screen.queryByText(/422: no conversation/)).toBeNull()
        );
    });
});

// ---- helpers ---------------------------------------------------------------

async function unlockGeminiVault() {
    const settings = useSettingsStore.getState();
    await settings.unlockVault('correct vault phrase');
    await settings.setProviderConfig('gemini', {
        apiKey: 'sk-live-secret',
        model: 'gemini-2.0-flash',
        temperature: 0.2,
        enabled: true,
    });
    settings.setDefaultProvider('gemini');
}
