// @vitest-environment happy-dom
/**
 * Roster reconciliation at the real create-meeting screen (spec-13).
 *
 * The catalog query is the source of persona metadata; the screen owns only
 * the selected identities. Refreshes that change a persona's metadata or the
 * catalog order must not resurrect a deselected participant, and entries that
 * disappear must leave the submission.
 */
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createScriptedFetch } from '../fixtures/transport';
import { resolveApiBaseUrl } from '@/shared/api/transport';

const push = vi.fn();
const back = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, back }),
}));

import NewMeetingPage from '@/app/meetings/new/page';

interface PersonaFixture {
    id: string;
    name: string;
    subtitle: string | null;
    color: string;
    avatar_url: string | null;
    provider_config: {
        provider: string | null;
        model: string | null;
        temperature: number | null;
        max_tokens: number | null;
    };
    is_default: boolean;
    stack_ids: string[];
    user_id: string | null;
    created_at: string;
    updated_at: string;
    active_prompt: string | null;
    active_prompt_version: number | null;
}

function persona(overrides: Partial<PersonaFixture> = {}): PersonaFixture {
    return {
        id: 'persona-1',
        name: 'The Investor',
        subtitle: 'Returns-first skeptic',
        color: '#38bdf8',
        avatar_url: null,
        provider_config: { provider: null, model: null, temperature: 0.7, max_tokens: 2000 },
        is_default: true,
        stack_ids: [],
        user_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        active_prompt: null,
        active_prompt_version: null,
        ...overrides,
    };
}

function catalog(personas: PersonaFixture[]) {
    return { personas, total: personas.length };
}

const MEETING = {
    id: 'meeting-new-1',
    name: 'Pricing committee kickoff',
    agenda: '',
    status: 'active',
    total_cost: 0,
    created_at: '2026-10-20T00:00:00Z',
    participants: [],
    messages: [],
};

function Wrapper({ children }: { children: ReactNode }) {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: { retry: false },
                    mutations: { retry: false },
                },
            })
    );
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function refreshButton(): HTMLButtonElement {
    const icon = document.querySelector('svg.lucide-refresh-cw');
    if (!icon) throw new Error('catalog refresh control not found');
    return icon.closest('button') as HTMLButtonElement;
}

function createButton(): HTMLButtonElement {
    const buttons = screen.getAllByRole('button', { name: /create meeting room/i });
    return buttons[buttons.length - 1] as HTMLButtonElement;
}

function selectionSummary(): HTMLElement {
    return screen.getByText(/advisors should participate/i);
}

describe('create meeting roster reconciliation', () => {
    const scripted = createScriptedFetch();

    beforeEach(() => {
        push.mockReset();
        back.mockReset();
        scripted.install();
    });

    afterEach(() => {
        scripted.reset();
    });

    it('keeps a deselected persona deselected when the catalog changes its metadata', async () => {
        scripted.enqueueJson(
            200,
            catalog([
                persona(),
                persona({ id: 'persona-2', name: 'The CTO', subtitle: 'Buildability first', color: '#a78bfa' }),
            ])
        );

        render(
            <Wrapper>
                <NewMeetingPage />
            </Wrapper>
        );
        await screen.findByText('The Investor');
        expect(selectionSummary()).toHaveTextContent('2 selected');

        // Deselect the investor; the CTO remains selected.
        fireEvent.click(screen.getAllByRole('checkbox')[0]!);
        expect(selectionSummary()).toHaveTextContent('1 selected');

        // A refresh delivers current metadata for the same identity. The
        // selection belongs to the identity, not to the old catalog snapshot.
        scripted.enqueueJson(
            200,
            catalog([
                persona({ subtitle: 'Unit economics, updated' }),
                persona({ id: 'persona-2', name: 'The CTO', subtitle: 'Buildability first', color: '#a78bfa' }),
            ])
        );
        fireEvent.click(refreshButton());

        await screen.findByText('Unit economics, updated');
        expect(selectionSummary()).toHaveTextContent('1 selected');
        expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked();
    });

    it('hydrates every persona selected and toggles a checkbox exactly once', async () => {
        scripted.enqueueJson(200, catalog([persona()]));

        render(
            <Wrapper>
                <NewMeetingPage />
            </Wrapper>
        );
        await screen.findByText('The Investor');
        const checkbox = screen.getAllByRole('checkbox')[0]!;
        expect(checkbox).toBeChecked();

        fireEvent.input(screen.getByLabelText(/Meeting Agenda/i), {
            target: { value: 'Pricing committee kickoff' },
        });
        await waitFor(() => expect(createButton()).toBeEnabled());

        fireEvent.click(checkbox);
        expect(checkbox).not.toBeChecked();
        expect(selectionSummary()).toHaveTextContent('0 selected');
        expect(createButton()).toBeDisabled();
    });

    it('leaves newly added personas unselected and submits only current identities', async () => {
        scripted.enqueueJson(
            200,
            catalog([
                persona(),
                persona({ id: 'persona-2', name: 'The CTO', subtitle: 'Buildability first', color: '#a78bfa' }),
            ])
        );

        render(
            <Wrapper>
                <NewMeetingPage />
            </Wrapper>
        );
        await screen.findByText('The Investor');
        fireEvent.click(screen.getAllByRole('checkbox')[0]!);

        fireEvent.input(screen.getByLabelText(/Meeting Agenda/i), {
            target: { value: 'Pricing committee kickoff' },
        });
        fireEvent.input(screen.getByLabelText(/Meeting Context/i), {
            target: { value: 'Unit economics review' },
        });

        scripted.enqueueJson(
            200,
            catalog([
                persona({ id: 'persona-2', name: 'The CTO', subtitle: 'Buildability first', color: '#a78bfa' }),
                persona({ subtitle: 'Unit economics, updated' }),
                persona({ id: 'persona-3', name: 'The Analyst', subtitle: 'Evidence first', color: '#34d399' }),
            ])
        );
        fireEvent.click(refreshButton());
        await screen.findByText('Unit economics, updated');

        const names = screen.getAllByText(/^The (Investor|CTO|Analyst)$/).map((node) => node.textContent);
        expect(names).toEqual(['The CTO', 'The Investor', 'The Analyst']);
        expect(screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-checked'))).toEqual([
            'true',
            'false',
            'false',
        ]);
        expect(selectionSummary()).toHaveTextContent('1 selected');

        scripted.enqueueJson(201, MEETING);
        fireEvent.click(createButton());

        await waitFor(() => {
            expect(
                scripted.calls.filter(
                    (call) => call.input === `${resolveApiBaseUrl()}/meetings` && call.init?.method === 'POST'
                )
            ).toHaveLength(1);
        });
        const createCall = scripted.calls.find(
            (call) => call.input === `${resolveApiBaseUrl()}/meetings` && call.init?.method === 'POST'
        );
        expect(JSON.parse(String(createCall?.init?.body))).toEqual({
            name: 'Pricing committee kickoff',
            agenda: 'Unit economics review',
            persona_ids: ['persona-2'],
        });
        await waitFor(() => expect(push).toHaveBeenCalledWith('/meetings/meeting-new-1'));
    });

    it('drops a removed persona from the roster and from the submission', async () => {
        scripted.enqueueJson(
            200,
            catalog([
                persona(),
                persona({ id: 'persona-2', name: 'The CTO', subtitle: 'Buildability first', color: '#a78bfa' }),
            ])
        );

        render(
            <Wrapper>
                <NewMeetingPage />
            </Wrapper>
        );
        await screen.findByText('The Investor');
        fireEvent.input(screen.getByLabelText(/Meeting Agenda/i), {
            target: { value: 'Pricing committee kickoff' },
        });

        scripted.enqueueJson(200, catalog([persona({ subtitle: 'Unit economics, updated' })]));
        fireEvent.click(refreshButton());
        await screen.findByText('Unit economics, updated');

        expect(screen.queryByText('The CTO')).toBeNull();
        expect(selectionSummary()).toHaveTextContent('1 selected');

        scripted.enqueueJson(201, MEETING);
        fireEvent.click(createButton());

        await waitFor(() => {
            expect(
                scripted.calls.filter(
                    (call) => call.input === `${resolveApiBaseUrl()}/meetings` && call.init?.method === 'POST'
                )
            ).toHaveLength(1);
        });
        const createCall = scripted.calls.find(
            (call) => call.input === `${resolveApiBaseUrl()}/meetings` && call.init?.method === 'POST'
        );
        expect(JSON.parse(String(createCall?.init?.body)).persona_ids).toEqual(['persona-1']);
    });

    it('preserves the draft and selection through a catalog error and recovery', async () => {
        scripted.enqueueJson(
            200,
            catalog([
                persona(),
                persona({ id: 'persona-2', name: 'The CTO', subtitle: 'Buildability first', color: '#a78bfa' }),
            ])
        );

        render(
            <Wrapper>
                <NewMeetingPage />
            </Wrapper>
        );
        await screen.findByText('The Investor');
        fireEvent.click(screen.getAllByRole('checkbox')[0]!);
        fireEvent.input(screen.getByLabelText(/Meeting Agenda/i), {
            target: { value: 'Pricing committee kickoff' },
        });
        fireEvent.input(screen.getByLabelText(/Meeting Context/i), {
            target: { value: 'Unit economics review' },
        });

        scripted.enqueueJson(500, { detail: 'catalog offline' });
        fireEvent.click(refreshButton());
        await waitFor(() =>
            expect(
                scripted.calls.filter((call) => call.input.startsWith(`${resolveApiBaseUrl()}/personas`))
            ).toHaveLength(2)
        );

        expect(selectionSummary()).toHaveTextContent('1 selected');
        expect(screen.getByLabelText(/Meeting Agenda/i)).toHaveValue('Pricing committee kickoff');
        expect(screen.getByLabelText(/Meeting Context/i)).toHaveValue('Unit economics review');
        expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked();

        scripted.enqueueJson(
            200,
            catalog([
                persona({ subtitle: 'Unit economics, recovered' }),
                persona({ id: 'persona-2', name: 'The CTO', subtitle: 'Buildability first', color: '#a78bfa' }),
            ])
        );
        fireEvent.click(refreshButton());
        await screen.findByText('Unit economics, recovered');

        expect(selectionSummary()).toHaveTextContent('1 selected');
        expect(screen.getByLabelText(/Meeting Agenda/i)).toHaveValue('Pricing committee kickoff');
        expect(screen.getByLabelText(/Meeting Context/i)).toHaveValue('Unit economics review');
        expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked();
    });

    it('keeps submission disabled without an agenda or a selectable roster', async () => {
        scripted.enqueueJson(200, catalog([]));
        const first = render(
            <Wrapper>
                <NewMeetingPage />
            </Wrapper>
        );
        await screen.findByText('No personas available');
        fireEvent.input(screen.getByLabelText(/Meeting Agenda/i), {
            target: { value: 'Pricing committee kickoff' },
        });
        expect(createButton()).toBeDisabled();
        first.unmount();

        scripted.enqueueJson(200, catalog([persona()]));
        render(
            <Wrapper>
                <NewMeetingPage />
            </Wrapper>
        );
        await screen.findByText('The Investor');
        expect(createButton()).toBeDisabled();

        fireEvent.input(screen.getByLabelText(/Meeting Agenda/i), { target: { value: '   ' } });
        expect(createButton()).toBeDisabled();

        fireEvent.input(screen.getByLabelText(/Meeting Agenda/i), {
            target: { value: 'Pricing committee kickoff' },
        });
        await waitFor(() => expect(createButton()).toBeEnabled());
    });
});
