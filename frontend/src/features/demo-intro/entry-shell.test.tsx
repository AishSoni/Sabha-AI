import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DemoEntryReadiness } from "@/features/demo-entry";
import { DemoEntryShell } from "./entry-shell";

function readiness(
    overrides: Partial<DemoEntryReadiness> = {}
): DemoEntryReadiness {
    return {
        sessionStatus: "loading",
        sessionError: null,
        safeConfigStatus: "idle",
        safeConfigError: null,
        retry: vi.fn(),
        retrySafeConfig: vi.fn(),
        retryEntry: vi.fn(),
        ...overrides,
    };
}

describe("DemoEntryShell", () => {
    it("shows one purposeful pending line without a spinner or old card", () => {
        render(<DemoEntryShell readiness={readiness()} />);

        expect(
            screen.getByRole("status")
        ).toHaveTextContent("Preparing the demo.");
        expect(
            screen.queryByText("Loading demo")
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText("Loading demo details")
        ).not.toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("offers scoped recovery for a session failure", () => {
        const state = readiness({
            sessionStatus: "error",
            sessionError: new Error("The demo could not reach the server. Try again."),
        });
        render(<DemoEntryShell readiness={state} />);

        expect(
            screen.getByText("The demo could not reach the server. Try again.")
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(state.retryEntry).toHaveBeenCalledOnce();
    });

    it("keeps destination content out of the pending shell", () => {
        render(<DemoEntryShell readiness={readiness()} />);

        expect(screen.queryByTestId("tutorial-hud")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("navigation", { name: "Demo workspace" })
        ).not.toBeInTheDocument();
    });
});
