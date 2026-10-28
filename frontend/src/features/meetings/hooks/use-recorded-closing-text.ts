'use client';

/**
 * Recorded closing text observation (spec-17).
 *
 * The hook consumes the typed closing transport and applies items through the
 * shared spec-15 projection. It never falls back to snapshot prose: when no
 * recorded stream exists the panel keeps its live-snapshot behavior. A dropped
 * stream leaves the last provisional item in place.
 */
import { useEffect, useRef, useState } from 'react';
import type { MeetingsRuntime } from '../runtime/contract';
import {
    createClosingTextState,
    applyClosingTextItem,
    type ClosingTextItem,
    type ClosingTextView,
} from '../model/closing-text';
import { combineSignals } from '@/shared/runtime/scope';

export interface UseRecordedClosingTextOptions {
    runtime?: MeetingsRuntime;
    meetingId: string;
    closingId: string | null | undefined;
    enabled?: boolean;
}

export function useRecordedClosingText({
    runtime,
    meetingId,
    closingId,
    enabled = true,
}: UseRecordedClosingTextOptions): ClosingTextView | null {
    const stream = runtime?.closingStream;
    const streamRef = useRef(stream);
    streamRef.current = stream;
    const runtimeSignal = runtime?.signal;
    const runtimeKey = runtime
        ? `${runtime.scope.identity.id}:${runtime.scope.identity.epoch}`
        : 'live';
    const [view, setView] = useState<ClosingTextView | null>(null);

    useEffect(() => {
        const source = streamRef.current;
        if (!source || !enabled || !closingId) {
            setView(null);
            return;
        }

        let cancelled = false;
        let controller: AbortController | null = null;
        let state = createClosingTextState(closingId, 'recorded-stream');
        setView(state);

        const run = async () => {
            controller = new AbortController();
            try {
                for await (const event of source.observe(meetingId, closingId, {
                    after: 0,
                    signal: combineSignals(runtimeSignal, controller.signal),
                })) {
                    if (cancelled) return;
                    if (event.closingId !== closingId) continue;
                    const item: ClosingTextItem = {
                        closingId: event.closingId,
                        itemId: event.itemId,
                        kind: event.kind,
                        sequence: event.sequence,
                        text: event.text,
                        provisional: event.provisional,
                        terminal: event.terminal,
                        result: event.result,
                        provenance: 'recorded-stream',
                        ...(event.subjectId ? { subjectId: event.subjectId } : {}),
                    };
                    state = applyClosingTextItem(state, item);
                    if (!cancelled) setView(state);
                }
            } catch (error) {
                if (cancelled) return;
                // Keep the last provisional view. A dropped observation is not
                // evidence of a completed closing.
            }
        };

        void run();

        return () => {
            cancelled = true;
            controller?.abort();
        };
    }, [closingId, enabled, meetingId, runtimeKey, runtimeSignal]);

    return view;
}
