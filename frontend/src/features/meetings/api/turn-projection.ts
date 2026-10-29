/**
 * Operation-scoped stream projection (spec-07).
 *
 * This store is deliberately not a canonical meeting mirror. It holds only
 * the transient projection of one observed operation so partial text, tool
 * activity, and citations can render before the final message is committed.
 * The meeting itself remains owned by the query layer/canonical reads.
 */
import { create } from 'zustand';
import { isTerminalTurnEvent, toolIdentity, type TurnEvent } from './turn-events';
import { isTurnStatus, type TurnStatus } from './turn-decoders';

export interface TurnToolProjection {
    identity: string;
    invocationId: string;
    callId: string;
    name: string;
    arguments: unknown;
    result?: unknown;
    isError: boolean;
    isExecuting: boolean;
}

export interface TurnCitationProjection {
    source: string;
    title: string;
    url: string;
    snippet: string | null;
    claimId: string | null;
    locator: string | null;
    documentId: string | null;
    revisionId: string | null;
    chunkId: string | null;
    chunkIndex: number | null;
    pageNumber: number | null;
}

export interface TurnProjection {
    meetingId: string;
    operationId: string;
    status: TurnStatus;
    text: string;
    thinking: string;
    toolCalls: TurnToolProjection[];
    citations: TurnCitationProjection[];
    lastSequence: number;
    terminal: TurnEvent | null;
    observationInterrupted: boolean;
    error: { code: string | null; message: string } | null;
    finalMessageId: string | null;
    usage: Record<string, unknown> | null;
    estimatedCost: number | null;
}

export type TurnProjectionScope = {
    meetingId: string;
    operationId: string;
    /**
     * Runtime epoch identity (spec-14). Live keeps the historical "live"
     * namespace; replay epochs never merge with live or with one another.
     */
    scopeId?: string;
};

type ProjectionStore = {
    projections: Record<string, TurnProjection>;
    ensure: (scope: TurnProjectionScope, status: TurnStatus) => void;
    apply: (scope: TurnProjectionScope, event: TurnEvent) => void;
    reset: (scope: TurnProjectionScope) => void;
    remove: (scope: TurnProjectionScope) => void;
};

export function turnProjectionKey(scope: TurnProjectionScope): string {
    return JSON.stringify([
        scope.scopeId ?? "live",
        scope.meetingId,
        scope.operationId,
    ]);
}

export function emptyTurnProjection(scope: TurnProjectionScope, status: TurnStatus): TurnProjection {
    return {
        meetingId: scope.meetingId,
        operationId: scope.operationId,
        status,
        text: '',
        thinking: '',
        toolCalls: [],
        citations: [],
        lastSequence: 0,
        terminal: null,
        observationInterrupted: false,
        error: null,
        finalMessageId: null,
        usage: null,
        estimatedCost: null,
    };
}

const TERMINAL_STATUS: Partial<Record<TurnEvent['type'], TurnStatus>> = {
    done: 'completed',
    error: 'failed',
    interrupted: 'interrupted',
    cancelled: 'cancelled',
};

const ACTIVE_STATUS_RANK: Partial<Record<TurnStatus, number>> = {
    queued: 0,
    executing: 1,
};

function matchesScope(scope: TurnProjectionScope, event: TurnEvent): boolean {
    // Synthetic local events carry empty identities; they are scoped by the
    // observer that produced them, not by the wire payload.
    if (event.meetingId && event.meetingId !== scope.meetingId) return false;
    if (event.operationId && event.operationId !== scope.operationId) return false;
    return true;
}

function applyToolCall(
    tools: TurnToolProjection[],
    event: TurnEvent
): TurnToolProjection[] {
    if (!event.invocationId || !event.callId) return tools;
    const identity = toolIdentity(event);
    const index = tools.findIndex((tool) => tool.identity === identity);

    if (event.type === 'tool_call') {
        const next: TurnToolProjection = {
            identity,
            invocationId: event.invocationId,
            callId: event.callId,
            name: event.toolName ?? '',
            arguments: event.arguments ?? {},
            isError: false,
            isExecuting: true,
        };
        if (index === -1) return [...tools, next];
        // A redelivered call may carry richer arguments; never discard a
        // result that arrived before the replay.
        return tools.map((tool, toolIndex) =>
            toolIndex === index
                ? { ...tool, name: next.name, arguments: next.arguments }
                : tool
        );
    }

    // A result without a preceding visible call is still rendered: the
    // backend may replay the result after the observer's cursor. The call
    // identity remains explicit so two same-name tools never merge.
    if (index === -1) {
        return [
            ...tools,
            {
                identity,
                invocationId: event.invocationId,
                callId: event.callId,
                name: event.toolName ?? '',
                arguments: {},
                result: event.result,
                isError: Boolean(event.isError),
                isExecuting: false,
            },
        ];
    }
    return tools.map((tool, toolIndex) =>
        toolIndex === index
            ? {
                  ...tool,
                  name: event.toolName || tool.name,
                  result: event.result,
                  isError: Boolean(event.isError),
                  isExecuting: false,
              }
            : tool
    );
}

/**
 * Pure reducer used by the store and by contract tests. It never appends
 * canonical messages and never starts inference.
 */
export function applyTurnEvent(
    projection: TurnProjection,
    scope: TurnProjectionScope,
    event: TurnEvent
): TurnProjection {
    if (!matchesScope(scope, event)) return projection;

    if (event.type === 'interrupted' && event.eventId === 'local-interruption') {
        return { ...projection, observationInterrupted: true };
    }
    if (projection.terminal) return projection;
    if (event.sequence <= projection.lastSequence) return projection;

    const next: TurnProjection = {
        ...projection,
        lastSequence: event.sequence,
        observationInterrupted: false,
    };

    switch (event.type) {
        case 'status':
            if (event.status && isTurnStatus(event.status)) next.status = event.status;
            break;
        case 'text':
            next.text += event.content ?? '';
            break;
        case 'thinking':
            next.thinking += event.content ?? '';
            break;
        case 'tool_call':
        case 'tool_result':
            next.toolCalls = applyToolCall(projection.toolCalls, event);
            break;
        case 'citation':
            next.citations = [
                ...projection.citations,
                {
                    source: event.source ?? '',
                    title: event.title ?? '',
                    url: event.url ?? '',
                    snippet: event.snippet ?? null,
                    claimId: event.claimId ?? null,
                    locator: event.locator ?? null,
                    documentId: event.documentId ?? null,
                    revisionId: event.revisionId ?? null,
                    chunkId: event.chunkId ?? null,
                    chunkIndex: event.chunkIndex ?? null,
                    pageNumber: event.pageNumber ?? null,
                },
            ];
            break;
        case 'done':
            next.status = 'completed';
            next.finalMessageId = event.messageId ?? null;
            next.usage = event.usage ?? null;
            next.estimatedCost = event.estimatedCost ?? null;
            break;
        case 'error':
            next.status = 'failed';
            next.error = {
                code: event.code ?? null,
                message: event.message ?? 'Turn execution failed.',
            };
            break;
        case 'interrupted':
            next.status = 'interrupted';
            next.error = {
                code: event.code ?? null,
                message: event.message ?? 'Turn execution was interrupted.',
            };
            break;
        case 'cancelled':
            next.status = 'cancelled';
            next.error = {
                code: event.code ?? null,
                message: event.message ?? 'Turn was cancelled.',
            };
            break;
    }

    if (isTerminalTurnEvent(event)) {
        next.status = TERMINAL_STATUS[event.type] ?? next.status;
        next.terminal = event;
    }
    return next;
}

export const useTurnProjectionStore = create<ProjectionStore>((set) => ({
    projections: {},
    ensure: (scope, status) =>
        set((state) => {
            const key = turnProjectionKey(scope);
            const current = state.projections[key];
            if (!current) {
                return {
                    projections: {
                        ...state.projections,
                        [key]: emptyTurnProjection(scope, status),
                    },
                };
            }
            if (current.terminal || current.status === status) return state;
            // A stale list snapshot may still say queued after the stream has
            // already reported executing. Active status only moves forward.
            if (
                (ACTIVE_STATUS_RANK[current.status] ?? 0) >
                (ACTIVE_STATUS_RANK[status] ?? 0)
            ) {
                return state;
            }
            return {
                projections: {
                    ...state.projections,
                    [key]: { ...current, status },
                },
            };
        }),
    apply: (scope, event) =>
        set((state) => {
            const key = turnProjectionKey(scope);
            const current = state.projections[key] ?? emptyTurnProjection(scope, 'queued');
            const next = applyTurnEvent(current, scope, event);
            if (next === current && state.projections[key] === current) return state;
            return { projections: { ...state.projections, [key]: next } };
        }),
    reset: (scope) =>
        set((state) => {
            const key = turnProjectionKey(scope);
            if (!state.projections[key]) return state;
            const projections = { ...state.projections };
            delete projections[key];
            return { projections };
        }),
    remove: (scope) =>
        set((state) => {
            const key = turnProjectionKey(scope);
            if (!state.projections[key]) return state;
            const projections = { ...state.projections };
            delete projections[key];
            return { projections };
        }),
}));

export function useTurnProjection(
    meetingId: string,
    operationId: string,
    scopeId = "live"
): TurnProjection | undefined {
    return useTurnProjectionStore(
        (state) =>
            state.projections[
                turnProjectionKey({ scopeId, meetingId, operationId })
            ]
    );
}
