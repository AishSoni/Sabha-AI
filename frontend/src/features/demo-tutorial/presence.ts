"use client";

/**
 * Presentation presence for the tutorial HUD (spec-29).
 *
 * Two external facts collapse the prompt: a recorded turn is streaming, or a
 * modal layer is open above the page. Both are observed, never inferred from
 * routes or timers.
 */
import { useEffect, useSyncExternalStore } from "react";

/* ------------------------------------------------------------------ streaming */

const busyKeys = new Set<string>();
const busyListeners = new Set<() => void>();

export function setTutorialBusy(key: string, active: boolean): void {
    if (active) {
        if (busyKeys.has(key)) return;
        busyKeys.add(key);
    } else {
        if (!busyKeys.delete(key)) return;
    }
    for (const listener of busyListeners) listener();
}

function subscribeBusy(listener: () => void): () => void {
    busyListeners.add(listener);
    return () => {
        busyListeners.delete(listener);
    };
}

export function useTutorialStreaming(): boolean {
    return useSyncExternalStore(
        subscribeBusy,
        () => busyKeys.size > 0,
        () => false
    );
}

/** Reports an active recorded stream for as long as `active` holds. */
export function useTutorialStreamingFlag(
    key: string,
    active: boolean
): void {
    useEffect(() => {
        setTutorialBusy(key, active);
        return () => setTutorialBusy(key, false);
    }, [key, active]);
}

/* ---------------------------------------------------------------------- facts */

const facts = new Set<string>();
const factListeners = new Set<() => void>();

/** Records a real read outcome (a tab opened, a revision viewed). */
export function markTutorialFact(fact: string): void {
    if (facts.has(fact)) return;
    facts.add(fact);
    for (const listener of factListeners) listener();
}

export function clearTutorialFacts(): void {
    if (facts.size === 0) return;
    facts.clear();
    for (const listener of factListeners) listener();
}

function subscribeFacts(listener: () => void): () => void {
    factListeners.add(listener);
    return () => {
        factListeners.delete(listener);
    };
}

export function useTutorialFact(fact: string): boolean {
    return useSyncExternalStore(
        subscribeFacts,
        () => facts.has(fact),
        () => false
    );
}

/* --------------------------------------------------------------------- modals */

const MODAL_SELECTOR =
    '[role="dialog"],[role="alertdialog"],[role="menu"],[data-radix-popper-content-wrapper]';

const modalListeners = new Set<() => void>();
let observer: MutationObserver | null = null;
let modalOpen = false;

function isOpen(node: Element): boolean {
    if (node.getAttribute("data-state") === "closed") return false;
    if (node.hasAttribute("hidden")) return false;
    if (node.getAttribute("aria-hidden") === "true") return false;
    return true;
}

function recomputeModals(): void {
    const next =
        typeof document !== "undefined" &&
        Array.from(document.querySelectorAll(MODAL_SELECTOR)).some(isOpen);
    if (next === modalOpen) return;
    modalOpen = next;
    for (const listener of modalListeners) listener();
}

function subscribeModals(listener: () => void): () => void {
    modalListeners.add(listener);
    if (!observer && typeof document !== "undefined") {
        observer = new MutationObserver(recomputeModals);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["role", "data-state", "hidden", "aria-hidden"],
        });
    }
    recomputeModals();
    return () => {
        modalListeners.delete(listener);
        if (modalListeners.size === 0) {
            observer?.disconnect();
            observer = null;
            modalOpen = false;
        }
    };
}

/** True while any Radix dialog, alert dialog or menu is open. */
export function useModalOpen(): boolean {
    return useSyncExternalStore(
        subscribeModals,
        () => modalOpen,
        () => false
    );
}
