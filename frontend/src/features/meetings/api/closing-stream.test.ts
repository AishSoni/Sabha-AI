/**
 * Recorded closing text wire contract (spec-17).
 *
 * The closing stream is separate from participant turns, carries explicit
 * ballot/summary identity, and never fabricates completion on EOF.
 */
import { describe, expect, it } from 'vitest';
import { makeSseResponse, sseFrame } from '../../../../tests/fixtures/sse';
import {
    decodeClosingTextEvent,
    decodeClosingTextStream,
    type ClosingTextEvent,
} from './closing-stream';

function wire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        event_id: 'event-1',
        closing_id: 'closing-1',
        meeting_id: 'meeting-1',
        item_id: 'ballot:participant-1',
        kind: 'ballot',
        sequence: 1,
        text: 'Yes — synthetic',
        provisional: false,
        terminal: true,
        result: 'yes',
        subject_id: 'participant-1',
        provenance: 'recorded-stream',
        ...overrides,
    };
}

async function collect(response: Response): Promise<ClosingTextEvent[]> {
    const events: ClosingTextEvent[] = [];
    for await (const event of decodeClosingTextStream(response)) {
        events.push(event);
    }
    return events;
}

describe('decodeClosingTextStream', () => {
    it('decodes arbitrary byte splits, Unicode, and duplicate sequences', async () => {
        const source =
            sseFrame(JSON.stringify(wire({ provisional: true, terminal: false, result: null }))) +
            sseFrame(JSON.stringify(wire({ sequence: 2, text: 'Yes — synthetic closing' }))) +
            sseFrame(JSON.stringify(wire({ sequence: 2, text: 'duplicate' })));
        const events = await collect(
            makeSseResponse([
                source.slice(0, 11),
                source.slice(11, 53),
                source.slice(53, 97),
                source.slice(97),
            ])
        );

        expect(events.map((event) => event.sequence)).toEqual([1, 2]);
        expect(events[1]?.text).toBe('Yes — synthetic closing');
        expect(events[1]).toMatchObject({
            kind: 'ballot',
            terminal: true,
            result: 'yes',
            provenance: 'recorded-stream',
            subjectId: 'participant-1',
        });
    });

    it('returns the received provisional text on EOF without inventing a terminal', async () => {
        const events = await collect(
            makeSseResponse([
                sseFrame(
                    JSON.stringify(
                        wire({
                            provisional: true,
                            terminal: false,
                            result: null,
                            text: 'The board is still voting',
                        })
                    )
                ),
            ])
        );

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            provisional: true,
            terminal: false,
            result: null,
        });
    });

    it('rejects a wrong provenance, ambiguous state, or terminal without result', () => {
        expect(() =>
            decodeClosingTextEvent(wire({ provenance: 'live-snapshot' }), 'closing')
        ).toThrow();
        expect(() =>
            decodeClosingTextEvent(
                wire({ provisional: true, terminal: true }),
                'closing'
            )
        ).toThrow();
        expect(() =>
            decodeClosingTextEvent(wire({ result: null }), 'closing')
        ).toThrow();
        expect(() =>
            decodeClosingTextEvent(wire({ result: 'maybe' }), 'closing')
        ).toThrow();
    });

    it('rejects an unknown closing text kind', () => {
        expect(() =>
            decodeClosingTextEvent(wire({ kind: 'summary-ish' }), 'closing')
        ).toThrow();
    });
});
