"use client";

/**
 * The demo introduction's lifecycle owner (spec-41).
 *
 * The introduction is now a continuous scroll journey, but acknowledgement,
 * reset, revisit, and focus restoration still belong here. Acknowledgement is
 * tab-scoped sessionStorage; the spatial journey itself is never persisted.
 */
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
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
    /** Set the moment derived from continuous journey progress. */
    setActiveStep(index: number): void;
    skip(): void;
    close(): void;
    enter(): void;
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
        // Private modes can refuse storage. The in-memory state still behaves
        // correctly for this mount; refresh re-shows the introduction.
    }
}

function forgetAcknowledged(): void {
    try {
        window.sessionStorage.removeItem(INTRO_STORAGE_KEY);
    } catch {
        // No persistent acknowledgement exists to clear.
    }
}

const useIsomorphicLayoutEffect =
    typeof window === "undefined" ? useEffect : useLayoutEffect;

export function DemoIntroProvider({ children }: { children: ReactNode }) {
    // Server and first client render agree on the first-visit state. The
    // post-hydration layout effect reads tab-scoped storage before paint.
    const [acknowledged, setAcknowledged] = useState(false);
    const [open, setOpen] = useState(true);
    const [hasEntered, setHasEntered] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const returnFocus = useRef<HTMLElement | null>(null);
    const hydrated = useRef(false);

    useIsomorphicLayoutEffect(() => {
        if (hydrated.current) return;
        hydrated.current = true;
        const seen = readAcknowledged();
        if (!seen) return;
        setAcknowledged(true);
        setOpen(false);
        setHasEntered(true);
    }, []);

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

    const setActiveStep = useCallback((index: number) => {
        setStepIndex(clampIntroStep(index));
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
        setActiveStep,
        skip: dismiss,
        close: dismiss,
        enter: dismiss,
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
