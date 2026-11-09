import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ApiError } from "@/shared/api/errors";
import {
    DEMO_MEETING_ID,
    demoSafeConfigWire,
    replaySessionWire,
} from "../../../../tests/fixtures/demo/journey";
import { ReplayMetadataGate } from "@/app/demo/replay-metadata-gate";
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
            <span data-testid="meeting">{state.session.meeting_id}</span>
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
    return render(
        <ReplaySessionProvider>{children}</ReplaySessionProvider>
    );
}

afterEach(() => {
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
        ).toBe("The recorded demo details are missing from this package.");
    });

    it("replaces the loading surface with explicit metadata recovery", async () => {
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
            <ReplayMetadataGate>
                <p>Board ready</p>
            </ReplayMetadataGate>
        );

        expect(
            await screen.findByRole("heading", {
                name: "Demo details unavailable",
            })
        ).toBeInTheDocument();
        expect(screen.queryByText("Board ready")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Try again" }));

        expect(await screen.findByText("Board ready")).toBeInTheDocument();
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

        expect(
            await screen.findByRole("heading", { name: "Demo unavailable" })
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));

        await waitFor(() =>
            expect(screen.getByTestId("status")).toHaveTextContent("ready")
        );
        expect(sessionCalls).toBe(2);
    });

});
