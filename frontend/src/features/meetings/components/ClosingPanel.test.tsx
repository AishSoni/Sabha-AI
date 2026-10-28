// @vitest-environment happy-dom
/**
 * Closing observation and command surface (spec-08).
 *
 * The panel must show the durable stage instead of a spinner, replay one
 * request key after an ambiguous failure, use a fresh key after a definitive
 * rejection, and never submit work just because progress was reloaded.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@/app/providers';
import {
    createScriptedFetch,
    type ScriptedFetch,
} from '../../../../tests/fixtures/transport';
import { LiveMeetingsRuntimeProvider } from '../runtime/live';
import type { ClosingTextView } from '../model/closing-text';
import { ClosingPanel } from './ClosingPanel';

const MEETING_ID = 'meeting-close-1';

const viewJson = (overrides: Record<string, unknown> = {}) => ({
    meeting_id: MEETING_ID,
    meeting_status: 'voting',
    archived: false,
    closing_id: 'closing-1',
    request_key: 'request-1',
    mode: 'vote',
    stage: null,
    failed_from_stage: null,
    votes: [],
    summary: null,
    summary_message_id: null,
    error: null,
    retryable: false,
    abortable: false,
    created_at: '2026-10-22T09:59:00Z',
    updated_at: '2026-10-22T10:00:00Z',
    completed_at: null,
    ...overrides,
});

const receiptJson = {
    meeting_id: MEETING_ID,
    closing_id: 'closing-1',
    stage: 'draining',
    meeting_status: 'voting',
};

let scripted: ScriptedFetch;
let queryClient: ReturnType<typeof makeQueryClient>;

function panelElement(
    status: 'active' | 'voting' | 'ended' | 'archived' = 'voting',
    textProjection?: ClosingTextView | null
) {
    return (
        <QueryClientProvider client={queryClient}>
            <LiveMeetingsRuntimeProvider>
                <ClosingPanel
                    meetingId={MEETING_ID}
                    meetingStatus={status}
                    textProjection={textProjection}
                />
            </LiveMeetingsRuntimeProvider>
        </QueryClientProvider>
    );
}

function renderPanel(
    status: 'active' | 'voting' | 'ended' | 'archived' = 'voting',
    textProjection?: ClosingTextView | null
) {
    return render(panelElement(status, textProjection));
}

function postBodies(): unknown[] {
    return scripted.calls
        .filter((call) => call.init?.method === 'POST')
        .map((call) =>
            typeof call.init?.body === 'string' ? JSON.parse(call.init.body) : null
        );
}

beforeEach(() => {
    scripted = createScriptedFetch();
    scripted.install();
    queryClient = makeQueryClient();
});

afterEach(() => {
    scripted.reset();
    queryClient.clear();
});

describe('closing panel observation', () => {
    it('renders an advancing stage without submitting work', async () => {
        scripted.enqueueJson(
            200,
            viewJson({
                stage: 'draining',
                abortable: true,
            })
        );

        renderPanel();

        await waitFor(() =>
            expect(screen.getByText('Finishing queued work')).toBeInTheDocument()
        );
        expect(
            screen.getByText(/Reloading resumes observation, not generation/)
        ).toBeInTheDocument();
        expect(postBodies()).toHaveLength(0);
        expect(screen.queryByRole('button', { name: /Vote to End/ })).toBeNull();
    });

    it('reconciles a completed close from a reload without replaying it', async () => {
        scripted.enqueueJson(
            200,
            viewJson({
                stage: 'completed',
                meeting_status: 'ended',
                summary: '📋 **MEETING ENDED**\nWe are done.',
                completed_at: '2026-10-22T10:05:00Z',
            })
        );

        renderPanel('ended');

        await waitFor(() => expect(screen.getByText(/We are done/)).toBeInTheDocument());
        expect(screen.getByText('Meeting ended')).toBeInTheDocument();
        expect(postBodies()).toHaveLength(0);
        expect(screen.queryByRole('button', { name: /Force End/ })).toBeNull();
    });

    it('renders one scoped recorded item and replaces it with canonical text', async () => {
        scripted.enqueueJson(
            200,
            viewJson({
                stage: 'voting',
                summary: 'Snapshot summary that must stay hidden.',
                summary_message_id: 'summary-1',
                votes: [
                    {
                        participant_id: 'investor',
                        participant_name: 'The Investor',
                        vote: true,
                        reason: 'Snapshot reason that must stay hidden.',
                        status: 'completed',
                    },
                ],
            })
        );

        const provisional: ClosingTextView = {
            closingId: 'closing-1',
            provenance: 'recorded-stream',
            items: [
                {
                    closingId: 'closing-1',
                    itemId: 'ballot:investor',
                    kind: 'ballot',
                    sequence: 1,
                    text: 'Provisional reason',
                    provisional: true,
                    terminal: false,
                    result: null,
                    provenance: 'recorded-stream',
                    subjectId: 'investor',
                },
                {
                    closingId: 'closing-1',
                    itemId: 'summary:summary-1',
                    kind: 'summary',
                    sequence: 2,
                    text: 'Provisional brief',
                    provisional: true,
                    terminal: false,
                    result: null,
                    provenance: 'recorded-stream',
                },
            ],
        };
        const view = renderPanel('voting', provisional);

        expect(await screen.findByText('Provisional reason')).toBeInTheDocument();
        expect(screen.getByText('Provisional brief')).toBeInTheDocument();
        expect(screen.queryByText(/Snapshot reason that must stay hidden/)).toBeNull();
        expect(screen.queryByText(/Snapshot summary that must stay hidden/)).toBeNull();
        expect(
            document.querySelectorAll('[data-closing-item-id="ballot:investor"]')
        ).toHaveLength(1);

        view.rerender(
            panelElement('voting', {
                ...provisional,
                items: [
                    {
                        ...provisional.items[0],
                        sequence: 3,
                        text: 'Canonical reason',
                        provisional: false,
                        terminal: true,
                        result: 'yes',
                    },
                    {
                        ...provisional.items[1],
                        sequence: 4,
                        text: 'Canonical brief',
                        provisional: false,
                        terminal: true,
                        result: 'completed',
                    },
                ],
            })
        );

        expect(screen.getByText('Canonical reason')).toBeInTheDocument();
        expect(screen.getByText('Canonical brief')).toBeInTheDocument();
        expect(screen.queryByText('Provisional reason')).toBeNull();
        expect(screen.queryByText('Provisional brief')).toBeNull();
        expect(
            document.querySelectorAll('[data-closing-item-id="ballot:investor"]')
        ).toHaveLength(1);
        expect(
            document.querySelector('[data-closing-item-id="ballot:investor"]')
        ).toHaveAttribute('data-closing-text-state', 'terminal');
    });

    it('ignores a projection scoped to a different closing instead of showing snapshot text', async () => {
        scripted.enqueueJson(
            200,
            viewJson({
                stage: 'voting',
                summary: 'Snapshot summary that must stay hidden.',
                votes: [
                    {
                        participant_id: 'investor',
                        participant_name: 'The Investor',
                        vote: true,
                        reason: 'Snapshot reason that must stay hidden.',
                        status: 'completed',
                    },
                ],
            })
        );

        renderPanel('voting', {
            closingId: 'another-closing',
            provenance: 'recorded-stream',
            items: [
                {
                    closingId: 'another-closing',
                    itemId: 'ballot:investor',
                    kind: 'ballot',
                    sequence: 1,
                    text: 'Text from another closing',
                    provisional: false,
                    terminal: true,
                    result: 'yes',
                    provenance: 'recorded-stream',
                    subjectId: 'investor',
                },
            ],
        });

        expect(await screen.findByText('The Investor')).toBeInTheDocument();
        expect(screen.queryByText('Text from another closing')).toBeNull();
        expect(screen.queryByText(/Snapshot reason that must stay hidden/)).toBeNull();
        expect(screen.queryByText(/Snapshot summary that must stay hidden/)).toBeNull();
    });

    it('keeps an archived meeting read-only', async () => {
        scripted.enqueueJson(
            200,
            viewJson({
                meeting_status: 'archived',
                archived: true,
                stage: 'completed',
            })
        );

        renderPanel('archived');

        await waitFor(() => expect(screen.getByText('Meeting archived')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: /Vote to End/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Force End/ })).toBeNull();
    });

    it('shows ballots with abstentions and failures', async () => {
        scripted.enqueueJson(
            200,
            viewJson({
                stage: 'voting',
                votes: [
                    {
                        participant_id: 'p-1',
                        participant_name: 'The Investor',
                        vote: true,
                        reason: 'ROI is clear',
                        status: 'completed',
                        provider: 'openrouter',
                        model: 'a',
                        usage_kind: 'reported',
                        price_kind: 'catalog',
                        estimated_cost: 0.01,
                        reported_cost: null,
                        error_message: null,
                    },
                    {
                        participant_id: 'p-2',
                        participant_name: 'The CTO',
                        vote: null,
                        reason: null,
                        status: 'completed',
                        provider: 'openrouter',
                        model: 'a',
                        usage_kind: 'unknown',
                        price_kind: 'unknown',
                        estimated_cost: null,
                        reported_cost: null,
                        error_message: 'provider timeout',
                    },
                ],
            })
        );

        renderPanel();

        await waitFor(() => expect(screen.getByText('The Investor')).toBeInTheDocument());
        expect(screen.getByText('Yes')).toBeInTheDocument();
        expect(screen.getByText('No vote')).toBeInTheDocument();
        expect(screen.getByText('provider timeout')).toBeInTheDocument();
        expect(screen.getByText('$0.0100')).toBeInTheDocument();
        expect(screen.getByText('Usage not reported')).toBeInTheDocument();
        expect(postBodies()).toHaveLength(0);
    });

    it('keeps the spinner only on a pending ballot and labels unknown usage', async () => {
        scripted.enqueueJson(
            200,
            viewJson({
                stage: 'voting',
                votes: [
                    {
                        participant_id: 'p-1',
                        participant_name: 'The Investor',
                        vote: null,
                        reason: null,
                        status: 'pending',
                        usage_kind: null,
                        price_kind: null,
                        estimated_cost: null,
                        reported_cost: null,
                        error_message: null,
                    },
                    {
                        participant_id: 'p-2',
                        participant_name: 'The CTO',
                        vote: null,
                        reason: null,
                        status: 'completed',
                        usage_kind: 'reported',
                        price_kind: 'unpriced',
                        estimated_cost: null,
                        reported_cost: null,
                        error_message: 'No usable vote was returned.',
                        error_code: 'no_vote',
                    },
                ],
            })
        );

        renderPanel();

        await waitFor(() => expect(screen.getByText('The Investor')).toBeInTheDocument());
        expect(screen.getByText('Usage unpriced')).toBeInTheDocument();
        expect(screen.getByText('Error code: no_vote')).toBeInTheDocument();
        expect(
            document.querySelector(
                '[data-vote-status="pending"] [class*="animate-spin"]'
            )
        ).not.toBeNull();
        expect(
            document.querySelector(
                '[data-vote-status="no-vote"] [class*="animate-spin"]'
            )
        ).toBeNull();
        expect(postBodies()).toHaveLength(0);
    });
});

describe('closing commands', () => {
    it('starts a vote close with one request key and no local stage guessing', async () => {
        scripted.enqueueJson(200, viewJson());
        scripted.enqueueJson(202, receiptJson);
        scripted.enqueueJson(200, viewJson({ stage: 'draining', abortable: true }));

        renderPanel();

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Vote to End/ })).toBeInTheDocument()
        );
        fireEvent.click(screen.getByRole('button', { name: /Vote to End/ }));
        fireEvent.click(screen.getByRole('button', { name: /Start Vote/ }));

        await waitFor(() => expect(postBodies()).toHaveLength(1));
        expect(postBodies()[0]).toMatchObject({ mode: 'vote' });
        expect(String((postBodies()[0] as { request_key: string }).request_key)).toMatch(
            /[0-9a-f-]{20,}/
        );
        await waitFor(() =>
            expect(screen.getByText('Finishing queued work')).toBeInTheDocument()
        );
    });

    it('force end skips the vote stage', async () => {
        scripted.enqueueJson(200, viewJson());
        scripted.enqueueJson(202, { ...receiptJson, mode: 'force' });
        scripted.enqueueJson(200, viewJson({ stage: 'summarizing', mode: 'force' }));

        renderPanel();

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Force End/ })).toBeInTheDocument()
        );
        fireEvent.click(screen.getByRole('button', { name: /Force End/ }));
        fireEvent.click(screen.getByRole('button', { name: /Force End/ }));

        await waitFor(() => expect(postBodies()).toHaveLength(1));
        expect(postBodies()[0]).toMatchObject({ mode: 'force' });
        await waitFor(() => expect(screen.getByText('Writing summary')).toBeInTheDocument());
    });

    it('replays the same request key after an ambiguous 5xx failure', async () => {
        scripted.enqueueJson(200, viewJson());
        scripted.enqueueJson(503, { detail: 'try again' });
        scripted.enqueueJson(503, { detail: 'try again' });

        renderPanel();

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Vote to End/ })).toBeInTheDocument()
        );

        for (let attempt = 0; attempt < 2; attempt += 1) {
            fireEvent.click(screen.getByRole('button', { name: /Vote to End/ }));
            fireEvent.click(screen.getByRole('button', { name: /Start Vote/ }));
            await waitFor(() => expect(postBodies()).toHaveLength(attempt + 1));
        }

        const [first, second] = postBodies() as { request_key: string }[];
        expect(second?.request_key).toBe(first?.request_key);
    });

    it('uses a fresh request key after a definitive 4xx rejection', async () => {
        scripted.enqueueJson(200, viewJson());
        scripted.enqueueJson(409, { detail: 'meeting changed' });
        scripted.enqueueJson(409, { detail: 'meeting changed' });

        renderPanel();

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Vote to End/ })).toBeInTheDocument()
        );

        for (let attempt = 0; attempt < 2; attempt += 1) {
            fireEvent.click(screen.getByRole('button', { name: /Vote to End/ }));
            fireEvent.click(screen.getByRole('button', { name: /Start Vote/ }));
            await waitFor(() => expect(postBodies()).toHaveLength(attempt + 1));
        }

        const [first, second] = postBodies() as { request_key: string }[];
        expect(second?.request_key).not.toBe(first?.request_key);
    });

    it('offers explicit retry and abort for a recoverable failure', async () => {
        scripted.enqueueJson(
            200,
            viewJson({
                stage: 'failed',
                failed_from_stage: 'summarizing',
                error: { code: 'summary_failed', message: 'The provider timed out.' },
                retryable: true,
                abortable: true,
            })
        );
        scripted.enqueueJson(
            200,
            viewJson({ stage: 'summarizing', abortable: false })
        );

        renderPanel();

        await waitFor(() => expect(screen.getByText('Closing failed')).toBeInTheDocument());
        expect(screen.getByText('The provider timed out.')).toBeInTheDocument();
        expect(screen.getByText(/summary_failed/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Retry closing/ }));

        await waitFor(() => expect(postBodies()).toHaveLength(1));
        expect(scripted.calls.at(-1)?.input).toBe(
            `http://localhost:8000/api/meetings/${MEETING_ID}/closing/retry`
        );
        await waitFor(() => expect(screen.getByText('Writing summary')).toBeInTheDocument());
    });

    it('aborts an advancing close explicitly without replaying work', async () => {
        scripted.enqueueJson(
            200,
            viewJson({ stage: 'voting', abortable: true })
        );
        scripted.enqueueJson(
            200,
            viewJson({
                stage: 'aborted',
                meeting_status: 'active',
                abortable: false,
            })
        );

        renderPanel();

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Abort closing/ })).toBeInTheDocument()
        );
        fireEvent.click(screen.getByRole('button', { name: /Abort closing/ }));

        await waitFor(() => expect(postBodies()).toHaveLength(1));
        expect(scripted.calls.at(-1)?.input).toBe(
            `http://localhost:8000/api/meetings/${MEETING_ID}/closing/abort`
        );
        await waitFor(() => expect(screen.getByText('Closing abandoned')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /Vote to End/ })).toBeInTheDocument();
    });

    it('submits only one close when the confirm control is clicked twice', async () => {
        scripted.enqueueJson(200, viewJson());
        scripted.enqueueJson(202, receiptJson);
        scripted.enqueueJson(200, viewJson({ stage: 'draining', abortable: true }));
        scripted.enqueueJson(202, receiptJson);
        scripted.enqueueJson(200, viewJson({ stage: 'draining', abortable: true }));

        renderPanel();

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Vote to End/ })).toBeInTheDocument()
        );
        fireEvent.click(screen.getByRole('button', { name: /Vote to End/ }));
        const confirm = screen.getByRole('button', { name: /Start Vote/ });
        fireEvent.click(confirm);
        fireEvent.click(confirm);

        await waitFor(() => expect(postBodies()).toHaveLength(1));
        await waitFor(() =>
            expect(screen.getByText('Finishing queued work')).toBeInTheDocument()
        );
    });

    it('allows starting again after a rejected vote while the meeting stays active', async () => {
        scripted.enqueueJson(200, viewJson({ stage: 'rejected' }));

        renderPanel('active');

        await waitFor(() => expect(screen.getByText('Closing rejected')).toBeInTheDocument());
        expect(
            screen.getByText(/The board did not approve closing/)
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Vote to End/ })).toBeInTheDocument();
        expect(postBodies()).toHaveLength(0);
    });
});
