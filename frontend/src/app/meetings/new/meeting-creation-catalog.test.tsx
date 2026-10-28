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
import { fireEvent, render, screen } from '@testing-library/react';
import { createScriptedFetch } from '../../../../tests/fixtures/transport';

const push = vi.fn();
const back = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, back }),
}));

import NewMeetingPage from './page';

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
    return buttons[buttons.length - 1]!;
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
});
