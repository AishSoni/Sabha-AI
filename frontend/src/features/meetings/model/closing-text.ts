import type { ClosingView } from '../api/closing-decoders';

/**
 * A narrow, transport-free projection for closing generated text.
 *
 * Spec 17 owns the closing stream schema and transport. This model only
 * describes how already-received items are scoped, ordered, and replaced. The
 * panel renders one item per identity; late or unrelated items cannot leak
 * into another closing or overwrite a settled item.
 */
export type ClosingTextKind = 'ballot' | 'summary';

export type ClosingTextProvenance =
    | 'live-snapshot'
    | 'recorded-snapshot'
    | 'recorded-stream';

export type ClosingTextResult = 'yes' | 'no' | 'no-vote' | 'completed';

export interface ClosingTextItem {
    closingId: string;
    itemId: string;
    kind: ClosingTextKind;
    sequence: number;
    text: string;
    provisional: boolean;
    terminal: boolean;
    result: ClosingTextResult | null;
    provenance: ClosingTextProvenance;
    /** Stable subject binding for ballots, when the transport provides one. */
    subjectId?: string;
}

export interface ClosingTextView {
    readonly closingId: string;
    readonly provenance: ClosingTextProvenance;
    readonly items: readonly ClosingTextItem[];
}

export type ClosingTextState = ClosingTextView;

export function createClosingTextState(
    closingId: string,
    provenance: ClosingTextProvenance
): ClosingTextState {
    return { closingId, provenance, items: [] };
}

function isApplicable(state: ClosingTextState, item: ClosingTextItem): boolean {
    return (
        item.closingId === state.closingId &&
        item.provenance === state.provenance &&
        Number.isSafeInteger(item.sequence) &&
        item.sequence >= 0 &&
        item.provisional !== item.terminal
    );
}

/**
 * Apply one streamed closing item.
 *
 * A higher sequence replaces provisional text for the same item ID. Once an
 * item is terminal, later provisional or duplicate terminal events are
 * ignored. Items for another closing or provenance never enter this state.
 */
export function applyClosingTextItem(
    state: ClosingTextState,
    item: ClosingTextItem
): ClosingTextState {
    if (!isApplicable(state, item)) return state;

    const currentIndex = state.items.findIndex(
        (existing) => existing.itemId === item.itemId
    );
    const current = currentIndex === -1 ? null : state.items[currentIndex];

    if (current) {
        if (current.terminal) return state;
        if (item.sequence <= current.sequence) return state;
    }

    const nextItems = [...state.items];
    if (currentIndex === -1) {
        nextItems.push(item);
    } else {
        nextItems[currentIndex] = item;
    }
    nextItems.sort((left, right) => {
        if (left.sequence !== right.sequence) return left.sequence - right.sequence;
        return left.itemId.localeCompare(right.itemId);
    });

    return { ...state, items: nextItems };
}

export function isRecordedClosingText(view: ClosingTextView): boolean {
    return view.provenance !== 'live-snapshot';
}

/**
 * Project the whole text carried by the live closing snapshot into terminal
 * items. Live polling keeps its existing behavior; recorded transports must
 * provide their own items instead of calling this projection.
 */
export function snapshotClosingText(
    closing: ClosingView,
    provenance: 'live-snapshot' | 'recorded-snapshot' = 'live-snapshot'
): ClosingTextView | null {
    const closingId = closing.closing_id;
    if (!closingId) return null;

    const items: ClosingTextItem[] = [];
    closing.votes.forEach((vote, index) => {
        if (!vote.reason) return;
        items.push({
            closingId,
            itemId: `ballot:${vote.participant_id}`,
            kind: 'ballot',
            sequence: index * 2,
            text: vote.reason,
            provisional: false,
            terminal: true,
            result:
                vote.vote === true ? 'yes' : vote.vote === false ? 'no' : 'no-vote',
            provenance,
            subjectId: vote.participant_id,
        });
    });

    if (closing.summary) {
        items.push({
            closingId,
            itemId: `summary:${closing.summary_message_id ?? 'final'}`,
            kind: 'summary',
            sequence: closing.votes.length * 2 + 1,
            text: closing.summary,
            provisional: false,
            terminal: true,
            result: 'completed',
            provenance,
        });
    }

    return {
        closingId,
        provenance,
        items,
    };
}

/**
 * Resolve the generated text for one ballot. A streamed item may bind by
 * participant ID or by the ballot item ID itself.
 */
export function findClosingBallotText(
    view: ClosingTextView,
    participantId: string
): ClosingTextItem | undefined {
    return view.items.find(
        (item) =>
            item.kind === 'ballot' &&
            (item.subjectId === participantId || item.itemId === participantId)
    );
}

export function findClosingSummaryText(
    view: ClosingTextView
): ClosingTextItem | undefined {
    return view.items.find((item) => item.kind === 'summary');
}
