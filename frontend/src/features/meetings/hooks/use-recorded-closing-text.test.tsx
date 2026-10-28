/**
 * Recorded closing text projection (spec-17).
 *
 * The hook applies only items for the mounted closing, keeps provisional text
 * on an interrupted stream, and freezes terminal items.
 */
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ClosingTextEvent } from '../api/closing-stream';
import {
    findClosingBallotText,
    findClosingSummaryText,
} from '../model/closing-text';
import type { MeetingsRuntime } from '../runtime/contract';
import { useRecordedClosingText } from './use-recorded-closing-text';

function event(overrides: Partial<ClosingTextEvent>): ClosingTextEvent {
    return {
        eventId: 'event-1',
        closingId: 'closing-1',
        meetingId: 'meeting-1',
        itemId: 'ballot:participant-1',
        kind: 'ballot',
        sequence: 1,
        text: 'Yes',
        provisional: false,
        terminal: true,
        result: 'yes',
        subjectId: 'participant-1',
        provenance: 'recorded-stream',
        ...overrides,
    };
}

function runtime(events: ClosingTextEvent[]): MeetingsRuntime {
    return {
        scope: {
            identity: { kind: 'replay', id: 'run-1:package-1', epoch: 1 },
            label: 'Recorded',
            provenance: {},
        },
        capabilities: {} as MeetingsRuntime['capabilities'],
        reads: {} as MeetingsRuntime['reads'],
        turns: {} as MeetingsRuntime['turns'],
        commands: {} as MeetingsRuntime['commands'],
        keys: {} as MeetingsRuntime['keys'],
        presentation: {
            label: 'Recorded',
            homeHref: '/demo',
            readOnlyNotice: 'Recorded.',
            provenance: {},
        },
        slots: {},
        signal: new AbortController().signal,
        closingStream: {
            observe: async function* () {
                for (const item of events) yield item;
            },
        },
    } as unknown as MeetingsRuntime;
}

describe('useRecordedClosingText', () => {
    it('applies provisional then terminal text for the mounted closing', async () => {
        const closingRuntime = runtime([
            event({
                sequence: 1,
                text: 'Yes — the synthetic',
                provisional: true,
                terminal: false,
                result: null,
            }),
            event({
                sequence: 2,
                text: 'Yes — the synthetic brief supports review.',
            }),
        ]);
        const { result } = renderHook(() =>
            useRecordedClosingText({
                runtime: closingRuntime,
                meetingId: 'meeting-1',
                closingId: 'closing-1',
            })
        );

        await waitFor(() => {
            const item = findClosingBallotText(result.current!, 'participant-1');
            expect(item?.terminal).toBe(true);
            expect(item?.text).toBe(
                'Yes — the synthetic brief supports review.'
            );
        });
        expect(result.current?.provenance).toBe('recorded-stream');
    });

    it('ignores a stream for another closing and keeps provisional text on EOF', async () => {
        const closingRuntime = runtime([
            event({
                sequence: 1,
                closingId: 'other-closing',
                text: 'Wrong scope',
            }),
            event({
                sequence: 2,
                itemId: 'summary:final',
                kind: 'summary',
                text: 'The board is still summarizing',
                provisional: true,
                terminal: false,
                result: null,
                subjectId: undefined,
            }),
        ]);
        const { result } = renderHook(() =>
            useRecordedClosingText({
                runtime: closingRuntime,
                meetingId: 'meeting-1',
                closingId: 'closing-1',
            })
        );

        await waitFor(() =>
            expect(findClosingSummaryText(result.current!)?.text).toBe(
                'The board is still summarizing'
            )
        );
        expect(result.current?.items).toHaveLength(1);
        expect(result.current?.items[0]?.provisional).toBe(true);
    });
});
