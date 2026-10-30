"use client";

/**
 * Room-level preview state. One provider per meeting room; every file row and
 * citation trigger opens the same dialog and loader.
 */

import * as React from "react";

import {
    EvidenceCitationContext,
    EvidenceContent,
    EvidenceDescriptor,
    EvidenceLoadError,
    EvidenceViewState,
    MeetingsEvidenceApi,
    disposeEvidenceContent,
    isEvidenceLoadError,
} from "./contract";
import { loadEvidenceContent } from "./loader";

interface ActiveEvidence {
    descriptor: EvidenceDescriptor;
    citation: EvidenceCitationContext;
}

export interface EvidencePreviewContextValue {
    adapter: MeetingsEvidenceApi;
    active: ActiveEvidence | null;
    state: EvidenceViewState;
    open: (
        descriptor: EvidenceDescriptor,
        citation?: EvidenceCitationContext
    ) => void;
    close: () => void;
    retry: () => void;
}

const EvidencePreviewContext =
    React.createContext<EvidencePreviewContextValue | null>(null);

export function useEvidencePreview(): EvidencePreviewContextValue {
    const value = React.useContext(EvidencePreviewContext);
    if (!value) {
        throw new Error(
            "useEvidencePreview must be used inside EvidencePreviewProvider"
        );
    }
    return value;
}

export interface EvidencePreviewProviderProps {
    adapter: MeetingsEvidenceApi;
    /** Meeting id + replay checkpoint (or live marker). Changing it cancels loads. */
    epoch: string;
    children: React.ReactNode;
}

export function EvidencePreviewProvider({
    adapter,
    epoch,
    children,
}: EvidencePreviewProviderProps) {
    const [active, setActive] = React.useState<ActiveEvidence | null>(null);
    const [state, setState] = React.useState<EvidenceViewState>({
        status: "idle",
    });
    const controllerRef = React.useRef<AbortController | null>(null);
    const requestRef = React.useRef(0);
    const contentRef = React.useRef<EvidenceContent | null>(null);
    const returnFocusRef = React.useRef<HTMLElement | null>(null);

    const disposeContent = React.useCallback(() => {
        disposeEvidenceContent(contentRef.current);
        contentRef.current = null;
    }, []);

    const cancel = React.useCallback(() => {
        requestRef.current += 1;
        controllerRef.current?.abort();
        controllerRef.current = null;
    }, []);

    const run = React.useCallback(
        async (descriptor: EvidenceDescriptor) => {
            cancel();
            disposeContent();
            const requestId = requestRef.current;
            const controller = new AbortController();
            controllerRef.current = controller;
            setState({ status: "loading" });

            try {
                const content = await loadEvidenceContent(adapter, descriptor, {
                    signal: controller.signal,
                });
                if (requestRef.current !== requestId) {
                    disposeEvidenceContent(content);
                    return;
                }
                contentRef.current = content;
                setState({ status: "ready", content });
            } catch (error) {
                if (requestRef.current !== requestId) {
                    return;
                }
                const failure = isEvidenceLoadError(error)
                    ? error
                    : new EvidenceLoadError(
                          "unknown",
                          "The evidence preview could not be loaded.",
                          { cause: error }
                      );
                setState({ status: "error", error: failure });
            } finally {
                if (controllerRef.current === controller) {
                    controllerRef.current = null;
                }
            }
        },
        [adapter, cancel, disposeContent]
    );

    const open = React.useCallback(
        (
            descriptor: EvidenceDescriptor,
            citation: EvidenceCitationContext = {}
        ) => {
            if (typeof document !== "undefined") {
                const activeElement = document.activeElement;
                if (activeElement instanceof HTMLElement) {
                    returnFocusRef.current = activeElement;
                }
            }
            setActive({ descriptor, citation });
            void run(descriptor);
        },
        [run]
    );

    const close = React.useCallback(() => {
        const returnFocus = returnFocusRef.current;
        returnFocusRef.current = null;
        cancel();
        disposeContent();
        setActive(null);
        setState({ status: "idle" });
        if (returnFocus && typeof window !== "undefined") {
            // Radix restores focus to the dialog trigger when it owns one.
            // Our trigger lives outside the dialog, so restore it explicitly
            // after the dialog has unmounted.
            window.setTimeout(() => {
                if (returnFocus.isConnected) {
                    returnFocus.focus();
                }
            }, 0);
        }
    }, [cancel, disposeContent]);

    const retry = React.useCallback(() => {
        if (active) {
            void run(active.descriptor);
        }
    }, [active, run]);

    // A meeting change, replay restart, or checkpoint switch ends the epoch.
    React.useEffect(() => {
        close();
        return () => {
            cancel();
            disposeContent();
        };
    }, [epoch, close, cancel, disposeContent]);

    const value = React.useMemo<EvidencePreviewContextValue>(
        () => ({ adapter, active, state, open, close, retry }),
        [adapter, active, state, open, close, retry]
    );

    return (
        <EvidencePreviewContext.Provider value={value}>
            {children}
        </EvidencePreviewContext.Provider>
    );
}
