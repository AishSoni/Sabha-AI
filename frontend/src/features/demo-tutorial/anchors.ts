"use client";

/**
 * Anchor registry (spec-29).
 *
 * Real controls register themselves by stable id. The registry never measures,
 * copies or positions anything; it only answers "is this control mounted".
 */
import { useCallback, useSyncExternalStore } from "react";
import type { TutorialAnchorId } from "./contract";

type Listener = () => void;

const elements = new Map<TutorialAnchorId, HTMLElement>();
const listeners = new Set<Listener>();
let version = 0;

function emit(): void {
    version += 1;
    for (const listener of listeners) listener();
}

/** Registers `element`; the returned cleanup only clears its own claim. */
export function registerAnchor(
    id: TutorialAnchorId,
    element: HTMLElement
): () => void {
    elements.set(id, element);
    emit();
    return () => {
        if (elements.get(id) === element) {
            elements.delete(id);
            emit();
        }
    };
}

export function getAnchor(id: TutorialAnchorId): HTMLElement | null {
    return elements.get(id) ?? null;
}

export function subscribeAnchors(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Test-only: forget every registration between mounts. */
export function resetAnchorRegistry(): void {
    elements.clear();
    emit();
}

function subscribe(listener: Listener): () => void {
    return subscribeAnchors(listener);
}

function snapshot(): number {
    return version;
}

function serverSnapshot(): number {
    return 0;
}

/** Re-renders the caller whenever any anchor mounts or unmounts. */
export function useAnchorVersion(): number {
    return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function useAnchorElement(id: TutorialAnchorId): HTMLElement | null {
    useAnchorVersion();
    return getAnchor(id);
}

export interface AnchorMatch {
    id: TutorialAnchorId;
    element: HTMLElement;
}

/** First mounted anchor from the candidate list, or null. */
export function useAnchorCandidates(
    ids: readonly TutorialAnchorId[]
): AnchorMatch | null {
    useAnchorVersion();
    for (const id of ids) {
        const element = getAnchor(id);
        if (element) return { id, element };
    }
    return null;
}

/** Callback ref for a real control, with React-19 ref cleanup. */
export function useAnchorRef(id: TutorialAnchorId) {
    return useCallback(
        (node: HTMLElement | null) => {
            if (!node) return;
            return registerAnchor(id, node);
        },
        [id]
    );
}
