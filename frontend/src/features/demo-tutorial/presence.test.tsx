import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
    setTutorialBusy,
    useModalOpen,
    useTutorialStreaming,
} from "./presence";

function Probe() {
    const modal = useModalOpen();
    const streaming = useTutorialStreaming();
    return (
        <p data-testid="presence">
            {String(modal)}:{String(streaming)}
        </p>
    );
}

function appendModal(role: string, state = "open"): HTMLElement {
    const node = document.createElement("div");
    node.setAttribute("role", role);
    node.setAttribute("data-state", state);
    document.body.appendChild(node);
    return node;
}

afterEach(() => {
    document.body.innerHTML = "";
    setTutorialBusy("test", false);
});

describe("tutorial presence", () => {
    it("suspends while a dialog is open and restores when it closes", async () => {
        render(<Probe />);
        expect(screen.getByTestId("presence").textContent).toBe("false:false");

        const dialog = appendModal("dialog");
        await waitFor(() =>
            expect(screen.getByTestId("presence").textContent).toBe(
                "true:false"
            )
        );

        dialog.setAttribute("data-state", "closed");
        await waitFor(() =>
            expect(screen.getByTestId("presence").textContent).toBe(
                "false:false"
            )
        );
    });

    it("treats an alert dialog and a menu as modal layers", async () => {
        render(<Probe />);
        const alert = appendModal("alertdialog");
        await waitFor(() =>
            expect(screen.getByTestId("presence").textContent).toBe(
                "true:false"
            )
        );
        alert.remove();

        appendModal("menu");
        await waitFor(() =>
            expect(screen.getByTestId("presence").textContent).toBe(
                "true:false"
            )
        );
    });

    it("ignores a hidden dialog", async () => {
        render(<Probe />);
        const dialog = appendModal("dialog");
        dialog.setAttribute("hidden", "");
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(screen.getByTestId("presence").textContent).toBe("false:false");
    });

    it("reports a streaming turn with or without a modal", async () => {
        render(<Probe />);
        act(() => setTutorialBusy("test", true));
        expect(screen.getByTestId("presence").textContent).toBe("false:true");

        appendModal("dialog");
        await waitFor(() =>
            expect(screen.getByTestId("presence").textContent).toBe(
                "true:true"
            )
        );

        act(() => setTutorialBusy("test", false));
        expect(screen.getByTestId("presence").textContent).toBe("true:false");
    });
});
