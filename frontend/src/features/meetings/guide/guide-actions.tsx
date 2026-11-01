"use client";

/**
 * Room-facing actions exposed by the guided replay controller.
 *
 * The guide still owns step completion; this context only lets the screen where
 * the recorded action happens acknowledge a review without sending the visitor
 * back to the top guide panel.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { ReplayLegalAction } from "../runtime/contract";

export interface GuideReview {
    beatId: string;
    tab: string;
    label: string;
    /** Returns false when the required tab/snapshot is not currently shown. */
    complete: () => boolean;
}

export interface GuideActions {
    review: GuideReview | null;
    activeIntentId: string | null;
    currentHref: string;
    nextHref: string | null;
    nextTab: string | null;
    advance: () => void;
}

/**
 * Canonical recorded actions belong to one ordered guided step. A non-canonical
 * transition is an exploration branch and remains available from its checkpoint.
 */
export function isActionAllowedByGuide(
    action: ReplayLegalAction,
    guide: GuideActions | null
): boolean {
    if (!guide) return true;
    if (action.intent.intent_id === guide.activeIntentId) return true;
    return !action.transition.canonical;
}

const GuideActionsContext = createContext<GuideActions | null>(null);

export function GuideActionsProvider({
    value,
    children,
}: {
    value: GuideActions;
    children: ReactNode;
}) {
    return (
        <GuideActionsContext.Provider value={value}>
            {children}
        </GuideActionsContext.Provider>
    );
}

export function useGuideActions(): GuideActions | null {
    return useContext(GuideActionsContext);
}
