/**
 * Contract for the meetings query layer: typed keys and decoded canonical
 * reads (spec-05).
 *
 * The query keys stay with the owning feature — no global registry. Every
 * read is identity-scoped (A and B never share a cache entry), the detail
 * read propagates an AbortSignal, and an empty meeting id stays disabled
 * so a half-rendered route cannot fire a request.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@/app/providers';
import { createScriptedFetch, type ScriptedFetch } from '../../../../tests/fixtures/transport';
import { meetingKeys } from './keys';
import { useMeeting, useMeetingList } from './queries';

let scripted: ScriptedFetch;
let queryClient: ReturnType<typeof makeQueryClient>;

const CREATED_AT = '2026-10-19T00:00:00.000Z';

const participantJson = {
    id: 'p-1',
    meeting_id: 'm-1',
    name: 'The Investor',
    role: 'Investor',
    system_prompt: 'Be skeptical.',
    provider_config: { provider: 'openrouter', model: 'x', temperature: 0.7, max_tokens: 2048 },
    color: '#6366f1',
    persona_id: null,
    stack_ids: null,
    created_at: CREATED_AT,
};

const messageJson = {
    id: 'msg-1',
    meeting_id: 'm-1',
    sender_type: 'user',
    sender_id: null,
    sender_name: 'Director',
    content: 'hello board',
    citations: [],
    tool_artifacts: null,
    thinking_content: null,
    estimated_cost: 0,
    created_at: CREATED_AT,
};

const meetingJson = {
    id: 'm-1',
    user_id: null,
    name: 'Board review',
    agenda: 'Ship the spec',
    status: 'active',
    total_cost: 0,
    created_at: CREATED_AT,
};

const detailJson = { ...meetingJson, participants: [participantJson], messages: [messageJson] };

const alphaDetailJson = {
    ...detailJson,
    id: 'm-1',
    name: 'Alpha review',
    participants: [{ ...participantJson, meeting_id: 'm-1', name: 'The Investor' }],
    messages: [{ ...messageJson, meeting_id: 'm-1' }],
};

const betaDetailJson = {
    ...detailJson,
    id: 'm-2',
    name: 'Beta review',
    participants: [],
    messages: [],
};

function ListProbe() {
    const query = useMeetingList();
    if (query.isError) return <div>list error: {String(query.error?.message)}</div>;
    return (
        <div>
            {query.isPending
                ? 'list loading'
                : `list: ${query.data?.map((meeting) => meeting.name).join(', ')}`}
        </div>
    );
}

function DetailProbe({ meetingId }: { meetingId: string }) {
    const query = useMeeting(meetingId);
    if (query.isError) return <div>detail error: {String(query.error?.message)}</div>;
    return (
        <div>
            {query.isPending
                ? 'detail loading'
                : `detail: ${query.data?.name} with ${query.data?.participants?.length ?? 0}`}
        </div>
    );
}

function UiHarness({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
    scripted = createScriptedFetch();
    queryClient = makeQueryClient();
});

afterEach(() => {
    scripted.reset();
});

describe('meeting query keys', () => {
    it('nails the canonical list and detail identities', () => {
        expect(meetingKeys.list()).toEqual(['meetings', 'list']);
        expect(meetingKeys.detail('m-1')).toEqual(['meetings', 'detail', 'm-1']);
        // Distinct identities, stable per identity.
        expect(meetingKeys.detail('m-2')).not.toEqual(meetingKeys.detail('m-1'));
        expect(meetingKeys.detail('m-1')).toEqual(meetingKeys.detail('m-1'));
    });
});

describe('canonical reads', () => {
    it('reads the list through the shared transport and decodes records', async () => {
        scripted.install();
        scripted.enqueueJson(200, [meetingJson]);

        render(
            <UiHarness>
                <ListProbe />
            </UiHarness>
        );

        await waitFor(() => screen.getByText('list: Board review'));
        expect(scripted.calls[0]?.input).toBe('http://localhost:8000/api/meetings');
    });

    it('reads a detail identity with an abort signal and decoded participants', async () => {
        scripted.install();
        scripted.enqueueJson(200, detailJson);

        render(
            <UiHarness>
                <DetailProbe meetingId="m-1" />
            </UiHarness>
        );

        await waitFor(() => screen.getByText('detail: Board review with 1'));
        expect(scripted.calls[0]?.input).toBe('http://localhost:8000/api/meetings/m-1');
        expect(scripted.calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    });

    it('keeps two meeting identities distinct on one screen', async () => {
        scripted.install();
        scripted.enqueueJson(200, alphaDetailJson);
        scripted.enqueueJson(200, betaDetailJson);

        render(
            <UiHarness>
                <DetailProbe meetingId="m-1" />
                <DetailProbe meetingId="m-2" />
            </UiHarness>
        );

        await waitFor(() => screen.getByText('detail: Alpha review with 1'));
        await waitFor(() => screen.getByText('detail: Beta review with 0'));
        expect(screen.queryByText('detail: Alpha review with 0')).toBeNull();
    });

    it('stays disabled for an empty meeting id (no fetch, no error)', async () => {
        scripted.install();

        render(
            <UiHarness>
                <DetailProbe meetingId="" />
            </UiHarness>
        );

        await waitFor(() => screen.getByText('detail loading'));
        expect(scripted.calls).toHaveLength(0);
    });
});
