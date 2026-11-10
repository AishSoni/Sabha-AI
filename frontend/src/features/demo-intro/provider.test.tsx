import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
    DemoIntroProvider,
    useDemoIntro,
} from "./provider";
import {
    INTRO_STEPS,
    INTRO_STORAGE_KEY,
    INTRO_STORAGE_VALUE,
} from "./steps";

function Probe() {
    const intro = useDemoIntro();
    return (
        <div>
            <span data-testid="open">{String(intro.open)}</span>
            <span data-testid="entered">{String(intro.hasEntered)}</span>
            <span data-testid="acknowledged">{String(intro.acknowledged)}</span>
            <span data-testid="step">{intro.step.id}</span>
            <span data-testid="label">{intro.stepLabel}</span>
            <button type="button" onClick={intro.next}>
                Next
            </button>
            <button type="button" onClick={intro.back}>
                Back
            </button>
            <button type="button" onClick={intro.skip}>
                Skip
            </button>
            <button
                type="button"
                data-testid="revisit"
                onClick={intro.revisit}
            >
                Revisit
            </button>
            <button type="button" onClick={intro.reset}>
                Reset
            </button>
            <button
                type="button"
                onClick={() => {
                    const target = intro.consumeReturnFocus();
                    document.title = target?.dataset.testid ?? "none";
                }}
            >
                Consume focus
            </button>
        </div>
    );
}

beforeEach(() => {
    window.sessionStorage.clear();
});

describe("demo introduction policy", () => {
    it("starts open and unacknowledged on a fresh tab", () => {
        render(
            <DemoIntroProvider>
                <Probe />
            </DemoIntroProvider>
        );

        expect(screen.getByTestId("open")).toHaveTextContent("true");
        expect(screen.getByTestId("entered")).toHaveTextContent("false");
        expect(screen.getByTestId("step")).toHaveTextContent("idea");
        expect(screen.getByTestId("label")).toHaveTextContent(
            `Step 1 of ${INTRO_STEPS.length}`
        );
    });

    it("acknowledges Skip in tab storage and reveals the workspace", () => {
        render(
            <DemoIntroProvider>
                <Probe />
            </DemoIntroProvider>
        );

        fireEvent.click(screen.getByRole("button", { name: "Skip" }));

        expect(screen.getByTestId("open")).toHaveTextContent("false");
        expect(screen.getByTestId("entered")).toHaveTextContent("true");
        expect(screen.getByTestId("acknowledged")).toHaveTextContent("true");
        expect(window.sessionStorage.getItem(INTRO_STORAGE_KEY)).toBe(
            INTRO_STORAGE_VALUE
        );
    });

    it("keeps a returning tab past the introduction", () => {
        window.sessionStorage.setItem(
            INTRO_STORAGE_KEY,
            INTRO_STORAGE_VALUE
        );

        render(
            <DemoIntroProvider>
                <Probe />
            </DemoIntroProvider>
        );

        expect(screen.getByTestId("open")).toHaveTextContent("false");
        expect(screen.getByTestId("entered")).toHaveTextContent("true");
    });

    it("revisits at step one without changing acknowledgement", () => {
        window.sessionStorage.setItem(
            INTRO_STORAGE_KEY,
            INTRO_STORAGE_VALUE
        );

        render(
            <DemoIntroProvider>
                <Probe />
            </DemoIntroProvider>
        );

        fireEvent.click(screen.getByRole("button", { name: "Revisit" }));
        expect(screen.getByTestId("open")).toHaveTextContent("true");
        expect(screen.getByTestId("step")).toHaveTextContent("idea");
        expect(window.sessionStorage.getItem(INTRO_STORAGE_KEY)).toBe(
            INTRO_STORAGE_VALUE
        );
    });

    it("clears acknowledgement only for an explicit reset", () => {
        window.sessionStorage.setItem(
            INTRO_STORAGE_KEY,
            INTRO_STORAGE_VALUE
        );

        render(
            <DemoIntroProvider>
                <Probe />
            </DemoIntroProvider>
        );

        fireEvent.click(screen.getByRole("button", { name: "Reset" }));

        expect(screen.getByTestId("open")).toHaveTextContent("true");
        expect(screen.getByTestId("acknowledged")).toHaveTextContent("false");
        expect(window.sessionStorage.getItem(INTRO_STORAGE_KEY)).toBeNull();
    });

    it("moves forward, backward, and remembers the revisit invoker", () => {
        window.sessionStorage.setItem(
            INTRO_STORAGE_KEY,
            INTRO_STORAGE_VALUE
        );

        render(
            <DemoIntroProvider>
                <Probe />
            </DemoIntroProvider>
        );

        const revisit = screen.getByRole("button", { name: "Revisit" });
        revisit.focus();
        fireEvent.click(revisit);
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        expect(screen.getByTestId("step")).toHaveTextContent("value");

        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(screen.getByTestId("step")).toHaveTextContent("idea");

        fireEvent.click(screen.getByRole("button", { name: "Consume focus" }));
        expect(document.title).toBe("revisit");
    });
});
