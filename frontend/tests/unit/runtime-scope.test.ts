/**
 * Runtime epoch isolation primitives (spec-14).
 *
 * A restart is a new identity, not a cache reset by convention. These tests
 * pin the key derivation so colliding meeting/operation ids cannot merge live
 * records, one replay epoch with another, or late completions with a restarted
 * run.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
    combineSignals,
    projectionScopeId,
    runtimeScopeKey,
} from '@/shared/runtime/scope';
import {
    turnProjectionKey,
    useTurnProjectionStore,
} from '@/features/meetings/api/turn-projection';
import type { TurnEvent } from '@/features/meetings/api/turn-events';

const liveScope = {
    identity: { kind: 'live' as const, id: 'live', epoch: 0 },
    label: 'Live',
    provenance: {},
};

const replayScope = (epoch: number) => ({
    identity: { kind: 'replay' as const, id: 'run-1:package-1', epoch },
    label: 'Recorded',
    provenance: { source: 'packaged' },
});

const event: TurnEvent = {
    type: 'text',
    meetingId: 'meeting-1',
    operationId: 'operation-1',
    eventId: 'event-1',
    sequence: 1,
    content: 'partial',
};

describe('runtime epoch isolation', () => {
    beforeEach(() => {
        useTurnProjectionStore.setState({ projections: {} });
    });

    it('keeps live projection identity stable and replay identities distinct', () => {
        expect(projectionScopeId(liveScope)).toBe('live');
        expect(projectionScopeId(replayScope(1))).toBe(
            runtimeScopeKey(replayScope(1))
        );
        expect(projectionScopeId(replayScope(1))).not.toBe(
            projectionScopeId(replayScope(2))
        );
        expect(runtimeScopeKey(replayScope(1))).not.toBe(
            runtimeScopeKey(replayScope(2))
        );
    });

    it('does not apply a pre-restart event to the new epoch projection', () => {
        const first = replayScope(1);
        const second = replayScope(2);
        const firstKey = turnProjectionKey({
            scopeId: projectionScopeId(first),
            meetingId: 'meeting-1',
            operationId: 'operation-1',
        });
        const secondKey = turnProjectionKey({
            scopeId: projectionScopeId(second),
            meetingId: 'meeting-1',
            operationId: 'operation-1',
        });
        expect(firstKey).not.toBe(secondKey);

        const store = useTurnProjectionStore.getState();
        store.ensure(
            {
                scopeId: projectionScopeId(first),
                meetingId: 'meeting-1',
                operationId: 'operation-1',
            },
            'executing'
        );
        store.apply(
            {
                scopeId: projectionScopeId(first),
                meetingId: 'meeting-1',
                operationId: 'operation-1',
            },
            event
        );

        expect(
            useTurnProjectionStore.getState().projections[firstKey]?.text
        ).toBe('partial');
        expect(
            useTurnProjectionStore.getState().projections[secondKey]
        ).toBeUndefined();
    });

    it('aborts a scoped request when either the runtime or caller aborts', () => {
        const runtime = new AbortController();
        const caller = new AbortController();
        const combined = combineSignals(runtime.signal, caller.signal)!;

        expect(combined.aborted).toBe(false);
        runtime.abort();
        expect(combined.aborted).toBe(true);
    });
});
