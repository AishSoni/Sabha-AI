/**
 * Private-access lifecycle (spec-22).
 *
 * A module-level epoch survives route navigation. Logging out ends the
 * epoch, aborts every live request composed with its signal, and lets the
 * access provider clean private caches exactly once. Late results from an
 * older epoch are rejected by the live transport rather than repopulating a
 * cleared or newly admitted scope.
 */

export type AccessEndReason =
    | 'signed_out'
    | 'token_invalid'
    | 'operator_denied'
    | 'session_lost';

export interface AccessSnapshot {
    active: boolean;
    epoch: number;
    reason: AccessEndReason | null;
}

export class AccessRevokedError extends Error {
    /** Named as an abort so the generic transport classifies it as aborted. */
    constructor() {
        super('Operator session ended');
        this.name = 'AbortError';
    }
}

let controller = new AbortController();
let snapshot: AccessSnapshot = { active: false, epoch: 0, reason: null };
const listeners = new Set<() => void>();

function publish(next: AccessSnapshot): void {
    snapshot = next;
    for (const listener of listeners) {
        listener();
    }
}

/** Begin a new admitted epoch (after sign-in or before the backend probe). */
export function beginAccess(): number {
    controller = new AbortController();
    publish({ active: true, epoch: snapshot.epoch + 1, reason: null });
    return snapshot.epoch;
}

/** End admission immediately and abort every request bound to the epoch. */
export function endAccess(reason: AccessEndReason): void {
    if (!snapshot.active) {
        return;
    }
    controller.abort();
    publish({ active: false, epoch: snapshot.epoch + 1, reason });
}

export function currentAccessSignal(): AbortSignal {
    return controller.signal;
}

export function currentAccessEpoch(): number {
    return snapshot.epoch;
}

export function isAccessActive(): boolean {
    return snapshot.active;
}

export function getAccessSnapshot(): AccessSnapshot {
    return snapshot;
}

export function subscribeAccess(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
