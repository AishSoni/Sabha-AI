"use client";

/**
 * The demo introduction's only state owner (spec-41).
 *
 * Acknowledgement is tab-scoped browser memory. It intentionally survives a
 * refresh but never crosses a browser session; no server state, cookie or
 * localStorage entry is introduced. The provider is only mounted after the
 * replay session exists, so reading sessionStorage can happen in the initial
 * client state without a server-render mismatch.
 */
import {
    createContext,
    useCallback,
    useContext,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    INTRO_STEPS,
    INTRO_STORAGE_KEY,
    INTRO_STORAGE_VALUE,
    clampIntroStep,
    introStepAt,
    type IntroStep,
} from "./steps";

interface DemoIntroValue {
    open: boolean;
    /** The workspace has been revealed at least once in this mount. */
    hasEntered: boolean;
    acknowledged: boolean;
    stepIndex: number;
    step: IntroStep;
    stepLabel: string;
    next(): void;
    back(): void;
    skip(): void;
    close(): void;
    revisit(): void;
    reset(): void;
    /** Read and clear the control that opened a deliberate revisit. */
    consumeReturnFocus(): HTMLElement | null;
}

const DemoIntroContext = createContext<DemoIntroValue | null>(null);

export function useDemoIntro(): DemoIntroValue {
    const value = useContext(DemoIntroContext);
    if (!value) {
        throw new Error("useDemoIntro must be used inside DemoIntroProvider.");
    }
    return value;
}

function readAcknowledged(): boolean {
    try {
        return (
            window.sessionStorage.getItem(INTRO_STORAGE_KEY) ===
            INTRO_STORAGE_VALUE
        );
    } catch {
        return false;
    }
}

function rememberAcknowledged(): void {
    try {
        window.sessionStorage.setItem(INTRO_STORAGE_KEY, INTRO_STORAGE_VALUE);
    } catch {
        // Storage can be unavailable in private modes. The in-memory state
        // still behaves correctly for this mount; refresh then re-shows the
        // introduction rather than failing.
    }
}

function forgetAcknowledged(): void {
    try {
        window.sessionStorage.removeItem(INTRO_STORAGE_KEY);
    } catch {
        // No persistent acknowledgement exists to clear.
    }
}

export function DemoIntroProvider({ children }: { children: ReactNode }) {
    const [acknowledged, setAcknowledged] = useState(readAcknowledged);
    const [open, setOpen] = useState(() => !readAcknowledged());
    const [hasEntered, setHasEntered] = useState(readAcknowledged);
    const [stepIndex, setStepIndex] = useState(0);
    const returnFocus = useRef<HTMLElement | null>(null);

    const dismiss = useCallback(() => {
        rememberAcknowledged();
        setAcknowledged(true);
        setHasEntered(true);
        setOpen(false);
    }, []);

    const next = useCallback(() => {
        setStepIndex((current) => {
            if (current >= INTRO_STEPS.length - 1) {
                dismiss();
                return current;
            }
            return current + 1;
        });
    }, [dismiss]);

    const back = useCallback(() => {
        setStepIndex((current) => clampIntroStep(current - 1));
    }, []);

    const revisit = useCallback(() => {
        returnFocus.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        setStepIndex(0);
        setOpen(true);
    }, []);

    const reset = useCallback(() => {
        forgetAcknowledged();
        setAcknowledged(false);
        setHasEntered(true);
        setStepIndex(0);
        setOpen(true);
    }, []);

    const consumeReturnFocus = useCallback(() => {
        const target = returnFocus.current;
        returnFocus.current = null;
        return target;
    }, []);

    const value: DemoIntroValue = {
        open,
        hasEntered,
        acknowledged,
        stepIndex,
        step: introStepAt(stepIndex),
        stepLabel: `Step ${stepIndex + 1} of ${INTRO_STEPS.length}`,
        next,
        back,
        skip: dismiss,
        close: dismiss,
        revisit,
        reset,
        consumeReturnFocus,
    };

    return (
        <DemoIntroContext.Provider value={value}>
            {children}
        </DemoIntroContext.Provider>
    );
}
