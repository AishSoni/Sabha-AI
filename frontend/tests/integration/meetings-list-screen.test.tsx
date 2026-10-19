/**
 * The meetings list screen is owned by the meetings feature (spec-05 S7).
 *
 * The screen must read meetings through the canonical list query and issue
 * archive/unarchive/delete through the feature's command mutations — not the
 * legacy `lib/api` facade. These tests pin:
 *
 * - the list renders from the canonical `/api/meetings` response with the
 *   no-sign-in transport contract (no user-auth headers, single owner);
 * - archiving posts the lifecycle command and the list identity is refetched
 *   so the archived tab reflects the revised snapshot without a manual reload;
 * - deleting posts the command, refetches the list, and closes the
 *   confirmation dialog once the record is gone.
 *
 * The source-level ownership assertions hold only once the page no longer
 * imports `@/lib/api` — that is the red→green boundary of the migration.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Providers, getQueryClient } from '@/app/providers';
import MeetingSpacePage from '@/app/meetings/page';
import { createScriptedFetch, type ScriptedFetch } from '../fixtures/transport';

function meetingWire(id: string, name: string, status: string) {
    return {
        id,
        user_id: null,
        name,
        agenda: `${name} agenda`,
        status,
        total_cost: 0,
        created_at: '2026-10-20T10:00:00.000000Z',
    };
}

describe('meetings list screen ownership', () => {
    let fetcher: ScriptedFetch;

    beforeEach(() => {
        fetcher = createScriptedFetch();
        // The browser query client is a module singleton; tests must start
        // from an empty cache so each screen renders through a real read.
        getQueryClient().clear();
        fetcher.install();
    });

    afterEach(() => {
        fetcher.reset();
    });

    it('renders meetings from the canonical list response', async () => {
        fetcher.enqueueJson(200, [
            meetingWire('m-1', 'Alpha review', 'active'),
            meetingWire('m-2', 'Beta review', 'archived'),
        ]);

        render(
            <Providers>
                <MeetingSpacePage />
            </Providers>
        );

        expect(await screen.findByText('Alpha review')).toBeInTheDocument();

        // The archived meeting is counted on the tab badge even though its
        // panel stays unmounted until the user switches tabs.
        expect(screen.getByRole('tab', { name: /archived/i })).toHaveTextContent('1');

        const listCall = fetcher.calls.at(-1)!;
        expect(listCall.input).toContain('/api/meetings');
        expect(listCall.init?.method ?? 'GET').toBe('GET');
        const headerKeys = Object.keys((listCall.init?.headers ?? {}) as Record<string, string>);
        expect(headerKeys.some((key) => /authorization|cookie|x-user-/i.test(key))).toBe(false);
    });

    it('reads and commands through the meetings feature, not the legacy facade', () => {
        const pageSource = readFileSync(
            join(process.cwd(), 'src/app/meetings/page.tsx'),
            'utf8'
        );

        expect(pageSource).not.toMatch(/from ['"]@\/lib\/api['"]/);
        expect(pageSource).not.toMatch(/api\.(listMeetings|archiveMeeting|unarchiveMeeting|deleteMeeting)/);
        expect(pageSource).toContain('@/features/meetings');
    });

    it('archiving revises the snapshot and refetches the list identity', async () => {
        fetcher.enqueueJson(200, [meetingWire('m-1', 'Alpha review', 'active')]);
        fetcher.enqueueJson(200, { success: true, message: 'Archived' });
        fetcher.enqueueJson(200, [meetingWire('m-1', 'Alpha review', 'archived')]);

        render(
            <Providers>
                <MeetingSpacePage />
            </Providers>
        );

        const card = (await screen.findByText('Alpha review')).closest('div.relative');
        expect(card).not.toBeNull();

        const trigger = card!.querySelector('[aria-haspopup="menu"]') as HTMLElement;
        trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse' }));
        fireEvent.click(trigger);

        const archiveItem = await screen.findByText('Archive');
        fireEvent.click(archiveItem);

        await waitFor(() => {
            expect(fetcher.calls).toHaveLength(3);
        });
        expect(fetcher.calls[1]!.init?.method).toBe('POST');
        expect(fetcher.calls[1]!.input).toContain('/api/meetings/m-1/archive');

        // The refetched snapshot moves the meeting onto the archived tab
        // badge without any manual reload.
        const archivedTab = screen.getByRole('tab', { name: /archived/i });
        expect(archivedTab).toHaveTextContent('1');
    });

    it('deleting removes the meeting and closes the confirmation dialog', async () => {
        fetcher.enqueueJson(200, [meetingWire('m-1', 'Doomed meeting', 'active')]);
        fetcher.enqueueJson(200, { success: true, message: 'Deleted' });
        fetcher.enqueueJson(200, []);

        render(
            <Providers>
                <MeetingSpacePage />
            </Providers>
        );

        const card = (await screen.findByText('Doomed meeting')).closest('div.relative');
        const trigger = card!.querySelector('[aria-haspopup="menu"]') as HTMLElement;
        trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse' }));
        fireEvent.click(trigger);

        fireEvent.click(await screen.findByText('Delete'));

        const dialog = await screen.findByRole('alertdialog');
        const confirmButton = dialog.querySelector('button.bg-red-600') as HTMLElement;
        fireEvent.click(confirmButton);

        await waitFor(() => {
            expect(fetcher.calls).toHaveLength(3);
        });
        expect(fetcher.calls[1]!.init?.method).toBe('DELETE');
        expect(fetcher.calls[1]!.input).toContain('/api/meetings/m-1');

        await waitFor(() => {
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        });
        await waitFor(() => {
            expect(screen.queryByText('Doomed meeting')).not.toBeInTheDocument();
        });
    });
});
