import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ApiError } from "@/shared/api/errors";
import {
    DEMO_MEETING_ID,
    demoSafeConfigWire,
    replaySessionWire,
} from "../../../../tests/fixtures/demo/journey";
import {
    clearEntryHandoff,
    stageEntryHandoff,
    type ReplayEntry,
} from "@/features/demo-entry";
import {
    ReplaySessionProvider,
    safeConfigFailureMessage,
    useReplaySession,
} from "./replay-session";

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function Probe() {
    const state = useReplaySession();
    return (
        <div>
            <span data-testid="meeting">
                {state.session?.meeting_id ?? "none"}
            </span>
            <span data-testid="session-status">{state.sessionStatus}</span>
            <span data-testid="status">{state.safeConfigStatus}</span>
            <span data-testid="config">
                {state.safeConfig?.board ? "board" : "missing"}
            </span>
            <button type="button" onClick={state.retrySafeConfig}>
                Retry details
            </button>
            <button type="button" onClick={state.retry}>
                Retry session
            </button>
        </div>
    );
}

function renderProvider(children: ReactNode = <Probe />) {
    return render(<ReplaySessionProvider>{children}</ReplaySessionProvider>);
}

function handoff(): ReplayEntry {
    return {
        session: replaySessionWire() as unknown as ReplayEntry["session"],
        safeConfig: demoSafeConfigWire(),
        checkpoint: "checkpoint-initial",
        requestId: "test-handoff",
        createdAt: Date.now(),
    };
}

afterEach(() => {
    clearEntryHandoff();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("replay session metadata recovery", () => {
    it("retries only the safe config and keeps the pinned session identity", async () => {
        let configCalls = 0;
        let sessionCalls = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: unknown) => {
                const url = String(input);
                if (url.endsWith("/replay/session")) {
                    sessionCalls += 1;
                    return json(replaySessionWire());
                }
                if (url.includes("/safe-config")) {
                    configCalls += 1;
                    if (configCalls === 1) {
                        return json({ detail: "metadata unavailable" }, 500);
                    }
                    return json(demoSafeConfigWire());
                }
                throw new Error(`Unexpected request: ${url}`);
            })
        );

        renderProvider();

        await waitFor(() =>
            expect(screen.getByTestId("status")).toHaveTextContent("error")
        );
        expect(screen.getByTestId("meeting")).toHaveTextContent(DEMO_MEETING_ID);

        fireEvent.click(screen.getByRole("button", { name: "Retry details" }));

        await waitFor(() =>
            expect(screen.getByTestId("status")).toHaveTextContent("ready")
        );
        expect(screen.getByTestId("config")).toHaveTextContent("board");
        expect(sessionCalls).toBe(1);
        expect(configCalls).toBe(2);
    });

    it("distinguishes a missing metadata read from a transient failure", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: unknown) => {
                const url = String(input);
                if (url.endsWith("/replay/session")) {
                    return json(replaySessionWire());
                }
                return json({ detail: "safe_config missing" }, 404);
            })
        );

        renderProvider();

        await waitFor(() =>
            expect(screen.getByTestId("status")).toHaveTextContent("error")
        );
        expect(
            safeConfigFailureMessage(
                new ApiError(
                    "http",
                    404,
                    "demo read 'safe_config' is not available here"
                )
            )
        ).toBe("The recorded demo details are missing from this server.");
    });

    it("keeps children mounted while the data layer recovers", async () => {
        let configCalls = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: unknown) => {
                const url = String(input);
                if (url.endsWith("/replay/session")) {
                    return json(replaySessionWire());
                }
                if (url.includes("/safe-config")) {
                    configCalls += 1;
                    if (configCalls === 1) {
                        return json({ detail: "metadata unavailable" }, 500);
                    }
                    return json(demoSafeConfigWire());
                }
                throw new Error(`Unexpected request: ${url}`);
            })
        );

        renderProvider(
            <>
                <Probe />
                <p>Destination content</p>
            </>
        );

        expect(screen.getByText("Destination content")).toBeInTheDocument();
        await waitFor(() =>
            expect(screen.getByTestId("status")).toHaveTextContent("error")
        );
        expect(screen.getByText("Destination content")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Retry details" }));

        await waitFor(() =>
            expect(screen.getByTestId("status")).toHaveTextContent("ready")
        );
        expect(screen.getByText("Destination content")).toBeInTheDocument();
        expect(configCalls).toBe(2);
    });

    it("keeps session failure recovery separate from metadata recovery", async () => {
        let sessionCalls = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: unknown) => {
                const url = String(input);
                if (url.endsWith("/replay/session")) {
                    sessionCalls += 1;
                    if (sessionCalls === 1) {
                        return json({ detail: "replay unavailable" }, 400);
                    }
                    return json(replaySessionWire());
                }
                return json(demoSafeConfigWire());
            })
        );

        renderProvider();

        await waitFor(() =>
            expect(screen.getByTestId("session-status")).toHaveTextContent(
                "error"
            )
        );
        fireEvent.click(screen.getByRole("button", { name: "Retry session" }));

        await waitFor(() =>
            expect(screen.getByTestId("status")).toHaveTextContent("ready")
        );
        expect(sessionCalls).toBe(2);
    });

    it("consumes an in-memory handoff without fetching again", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        stageEntryHandoff(handoff());

        renderProvider();

        expect(screen.getByTestId("session-status")).toHaveTextContent(
            "ready"
        );
        expect(screen.getByTestId("status")).toHaveTextContent("ready");
        expect(screen.getByTestId("meeting")).toHaveTextContent(DEMO_MEETING_ID);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
