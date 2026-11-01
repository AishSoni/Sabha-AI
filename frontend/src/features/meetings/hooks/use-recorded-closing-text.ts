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
    const speed = runtime?.replay?.playbackSpeed ?? 1;
    const runtimeKey = runtime
        ? `${runtime.scope.identity.id}:${runtime.scope.identity.epoch}`
        : 'live';
    const [view, setView] = useState<ClosingTextView | null>(null);
    const projectionRef = useRef<{
        key: string;
        view: ClosingTextView;
        after: number;
    } | null>(null);

    useEffect(() => {
        const source = streamRef.current;
        if (!source || !enabled || !closingId) {
            projectionRef.current = null;
            setView(null);
            return;
        }

        const key = `${runtimeKey}:${meetingId}:${closingId}`;
        let entry = projectionRef.current;
        if (!entry || entry.key !== key) {
            entry = {
                key,
                view: createClosingTextState(closingId, 'recorded-stream'),
                after: 0,
            };
            projectionRef.current = entry;
        }
        // A speed change reconnects at the last accepted sequence. It never
        // clears text the visitor has already seen or restarts at zero.
        setView(entry.view);
        if (
            entry.view.items.some(
                (item) => item.terminal && item.kind === 'summary'
            )
        ) {
            return;
        }

        let cancelled = false;
        let controller: AbortController | null = null;
        const current = entry;

        const run = async () => {
            controller = new AbortController();
            try {
                for await (const event of source.observe(meetingId, closingId, {
                    after: current.after,
                    speed,
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
                    const next = applyClosingTextItem(current.view, item);
                    if (next !== current.view) {
                        current.view = next;
                        current.after = Math.max(
                            current.after,
                            Number.isSafeInteger(item.sequence)
                                ? item.sequence
                                : current.after
                        );
                        if (projectionRef.current === current) {
                            setView(next);
                        }
                    }
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
    }, [closingId, enabled, meetingId, runtimeKey, runtimeSignal, speed]);

    return view;
}
