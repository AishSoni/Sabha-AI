// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    DemoWorkspaceProvider,
    useDemoWorkspace,
} from "@/features/demo-workspace";
import {
    DEMO_PINNED_IDENTITY,
    demoWorkspaceSeedEnvelope,
} from "../../../../tests/fixtures/demo/workspace";
import {
    useLocalStacks,
    type LocalStacksAdapter,
} from "./use-local-stacks";

function json(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as unknown as Response;
}

let adapter: LocalStacksAdapter;

function Probe() {
    const workspace = useDemoWorkspace();
    adapter = useLocalStacks();
    return (
        <div>
            <span data-testid="status">{workspace.status}</span>
            <span data-testid="rows">
                {adapter.stacks
                    .map(
                        (stack) =>
                            `${stack.name}:${stack.documentCount}:${stack.readyCount}:${stack.assignedParticipantNames?.join(",")}`
                    )
                    .join("|")}
            </span>
            <span data-testid="error">{adapter.error ?? ""}</span>
            <button
                type="button"
                onClick={() =>
                    void adapter.createStack({
                        name: "  Temporary research  ",
                        description: "  Practice only.  ",
                    })
                }
            >
                create
            </button>
            <button
                type="button"
                onClick={() =>
                    void adapter.updateStack("credit-evidence", {
                        name: "Renamed credit",
                        description: "Updated.",
                    })
                }
            >
                rename
            </button>
            <button
                type="button"
                onClick={() => adapter.deleteStack("credit-evidence")}
            >
                delete credit
            </button>
        </div>
    );
}

function renderProbe() {
    return render(
        <DemoWorkspaceProvider identity={DEMO_PINNED_IDENTITY}>
            <Probe />
        </DemoWorkspaceProvider>
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("local practice stacks", () => {
    it("shows real counts and current persona assignments", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => json(200, demoWorkspaceSeedEnvelope()))
        );
        renderProbe();
        await waitFor(() =>
            expect(screen.getByTestId("status").textContent).toBe("ready")
        );

        const rows = screen.getByTestId("rows").textContent!;
        expect(rows).toContain("Issuer fact sheet:1:1:The Credit Analyst");
        expect(rows).toContain("Credit evidence:0:0:The Credit Analyst");
        expect(rows).toContain("Downside worksheet:0:0:The Downside Reviewer");
        expect(rows).toContain("Portfolio mandate:0:0:The Portfolio Analyst");
    });

    it("creates, renames, and deletes stacks through the workspace", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => json(200, demoWorkspaceSeedEnvelope()))
        );
        renderProbe();
        await waitFor(() =>
            expect(screen.getByTestId("status").textContent).toBe("ready")
        );

        fireEvent.click(screen.getByRole("button", { name: "create" }));
        await waitFor(() =>
            expect(screen.getByTestId("rows").textContent).toContain(
                "Temporary research:0:0:"
            )
        );

        fireEvent.click(screen.getByRole("button", { name: "rename" }));
        await waitFor(() =>
            expect(screen.getByTestId("rows").textContent).toContain(
                "Renamed credit:0:0:The Credit Analyst"
            )
        );

        fireEvent.click(screen.getByRole("button", { name: "delete credit" }));
        await waitFor(() =>
            expect(screen.getByTestId("rows").textContent).not.toContain(
                "Renamed credit"
            )
        );
        expect(adapter.getStack("credit-evidence")).toBeNull();
    });
});
