// @vitest-environment happy-dom
/**
 * Room queue UI (spec-07).
 *
 * The room shows the active durable operation, the waiting FIFO entries, and
 * explicit cancellation. Observation pause is resumed locally; neither path
 * submits inference again.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    turnController: {
        operations: [] as unknown[],
        activeOperation: null as unknown,
        queuedOperations: [] as unknown[],
        activeParticipantId: null as string | null,
        projection: undefined as unknown,
        isObserving: false,
        isSubmitting: false,
        cancelingOperationId: null as string | null,
        actionError: null as string | null,
        submit: vi.fn(),
        cancel: vi.fn(),
        resumeObservation: vi.fn(),
        clearActionError: vi.fn(),
    },
}));

vi.mock('@/features/meetings', async () => {
    const actual = await vi.importActual<typeof import('@/features/meetings')>(
        '@/features/meetings'
    );
    return {
        ...actual,
        useMeetingTurnController: () => mocks.turnController,
    };
});

import { useMeetingStore } from '@/stores/meetingStore';
import { ChatArea } from '@/components/chat/ChatArea';

const MEETING_ID = 'meeting-1';
const PARTICIPANT_ID = 'participant-1';

const operation = {
    operation_id: 'operation-1',
    meeting_id: MEETING_ID,
    participant_id: PARTICIPANT_ID,
    request_key: 'key-1',
    status: 'executing',
    admission: 1,
    queue_position: null,
    created_at: '2026-10-22T10:00:00Z',
    started_at: '2026-10-22T10:00:01Z',
    completed_at: null,
    final_message_id: null,
    cancel_requested: false,
    error: null,
    effective_generation: null,
};

const projection = {
    meetingId: MEETING_ID,
    operationId: 'operation-1',
    status: 'executing',
    text: 'partial response',
    thinking: '',
    toolCalls: [],
    citations: [],
    lastSequence: 1,
    terminal: null,
    observationInterrupted: false,
    error: null,
    finalMessageId: null,
    usage: null,
    estimatedCost: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.turnController.operations = [];
    mocks.turnController.activeOperation = null;
    mocks.turnController.activeParticipantId = null;
    mocks.turnController.projection = undefined;
    mocks.turnController.isSubmitting = false;
    mocks.turnController.cancelingOperationId = null;
    mocks.turnController.actionError = null;

    useMeetingStore.setState({
        currentMeeting: {
            id: MEETING_ID,
            name: 'Policy Council',
            agenda: 'Budget',
            status: 'active',
            participants: [
                {
                    id: PARTICIPANT_ID,
                    meeting_id: MEETING_ID,
                    name: 'The Analyst',
                    role: 'analyst',
                    color: '#3b82f6',
                    provider_config: {
                        provider: 'ollama',
                        model: 'llama3',
                        temperature: 0.7,
                        max_tokens: 2048,
                    },
                },
            ],
            messages: [],
            total_cost: 0,
        } as never,
        error: null,
    });
});

describe('room turn queue', () => {
    it('shows the active operation, queue, and explicit cancellation', () => {
        mocks.turnController.activeOperation = operation;
        mocks.turnController.activeParticipantId = PARTICIPANT_ID;
        mocks.turnController.projection = projection;
        mocks.turnController.operations = [
            operation,
            { ...operation, operation_id: 'operation-2', status: 'queued', queue_position: 1 },
        ];

        render(<ChatArea />);

        expect(screen.getByText('partial response')).toBeInTheDocument();
        expect(screen.getByText(/keeps the context it started with/i)).toBeInTheDocument();
        expect(screen.getByText('queued #1')).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', { name: /Cancel/i })[0]!);
        expect(mocks.turnController.cancel).toHaveBeenCalledWith('operation-1');
    });

    it('resumes a paused observation without submitting a turn', () => {
        mocks.turnController.activeOperation = operation;
        mocks.turnController.activeParticipantId = PARTICIPANT_ID;
        mocks.turnController.projection = {
            ...projection,
            observationInterrupted: true,
        };

        render(<ChatArea />);

        expect(screen.getByText(/turn continues on the server/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /^Resume/i }));
        expect(mocks.turnController.resumeObservation).toHaveBeenCalledTimes(1);
        expect(mocks.turnController.submit).not.toHaveBeenCalled();
    });

    it('submits the clicked participant as a new durable admission', () => {
        render(<ChatArea />);

        fireEvent.click(screen.getByRole('button', { name: /Analyst/i }));

        expect(mocks.turnController.submit).toHaveBeenCalledTimes(1);
        expect(mocks.turnController.submit.mock.calls[0]?.[0]).toBe(PARTICIPANT_ID);
        expect(mocks.turnController.submit.mock.calls[0]?.[1]).toMatchObject({
            provider: 'ollama',
        });
    });
});
