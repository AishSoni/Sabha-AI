/**
 * Canonical demo journey characterization (spec-23 slice 1).
 *
 * Pins the eight-beat public journey before the expanded workspace extracts a
 * session provider and shared presentation: the board is step one, the guide
 * continues to the prepared intake, the recorded creation moves to step three,
 * and an invalid room deep link never falls through to live reads.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoLayout from "@/app/demo/layout";
import DemoBoardPage from "@/app/demo/page";
import DemoNewMeetingPage from "@/app/demo/new/page";
import DemoMeetingListPage from "@/app/demo/meetings/page";
import DemoMeetingPage from "@/app/demo/meetings/[id]/page";
import DemoSettingsPage from "@/app/demo/settings/page";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";
import {
    DEMO_MEETING_ID,
    demoSafeConfigWire,
    demoMeetingWire,
    replaySessionWire,
} from "../fixtures/demo/journey";

const API = "http://localhost:8000/api";

const demoLocation = vi.hoisted(() => {
    let pathname = "/demo";
    let params = new URLSearchParams("");
    let routeParams = { id: "" };
    const listeners = new Set<() => void>();

    const emit = () => {
        for (const listener of listeners) listener();
    };

    return {
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getPathname() {
            return pathname;
        },
        getSearchParams() {
            return params;
        },
        getRouteParams() {
            return routeParams;
        },
        navigate(href: string) {
            const url = new URL(href, "http://sabha.local");
            pathname = url.pathname;
            params = new URLSearchParams(url.search);
            const match = /^\/demo\/meetings\/([^/]+)$/.exec(pathname);
            routeParams = { id: match?.[1] ?? "" };
            emit();
        },
        reset() {
            pathname = "/demo";
            params = new URLSearchParams("");
            routeParams = { id: "" };
            emit();
        },
    };
});

vi.mock("next/navigation", async () => {
    const React = await import("react");
    return {
        usePathname: () =>
            React.useSyncExternalStore(
                demoLocation.subscribe,
                demoLocation.getPathname,
                demoLocation.getPathname
            ),
        useSearchParams: () =>
            React.useSyncExternalStore(
                demoLocation.subscribe,
                demoLocation.getSearchParams,
                demoLocation.getSearchParams
            ),
        useParams: () =>
            React.useSyncExternalStore(
                demoLocation.subscribe,
                demoLocation.getRouteParams,
                demoLocation.getRouteParams
            ),
        useRouter: () => ({
            push: demoLocation.navigate,
            replace: demoLocation.navigate,
            back: () => demoLocation.navigate("/demo"),
        }),
    };
});

vi.mock("next/link", async () => {
    const React = await import("react");
    return {
        default: function MockLink({
            href,
            children,
            onClick,
            ref,
        }: {
            href: string;
            children?: ReactNode;
            onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
            ref?: React.Ref<HTMLAnchorElement>;
        }) {
            return React.createElement(
                "a",
                {
                    href,
                    ref,
                    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
                        onClick?.(event);
                        if (!event.defaultPrevented) {
                            event.preventDefault();
                            demoLocation.navigate(href);
                        }
                    },
                },
                children
            );
        },
    };
});

function RoomRoute({ id }: { id: string }) {
    const run = useReplayRun();
    if (
        run.checkpoint === run.session.initial_checkpoint ||
        run.session.meeting_id !== id
    ) {
        return <DemoMeetingPage />;
    }
    return <p>{`Room route ${id}`}</p>;
}

function DemoRoute() {
    const pathname = usePathname();
    if (pathname === "/demo/settings") return <DemoSettingsPage />;
    if (pathname === "/demo") return <DemoBoardPage />;
    if (pathname === "/demo/new") return <DemoNewMeetingPage />;
    if (pathname === "/demo/meetings") return <DemoMeetingListPage />;
    const match = /^\/demo\/meetings\/([^/]+)$/.exec(pathname);
    if (match) return <RoomRoute id={match[1]} />;
    return <p>Unknown demo route</p>;
}

function json(status: number, body: unknown): Response {
    return {
        ok: status < 400,
        status,
        json: async () => body,
    } as unknown as Response;
}

function installDemoRouter() {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: unknown, init?: RequestInit) => {
            const url = String(input);
            calls.push({ url, method: init?.method ?? "GET" });
            const parsed = new URL(url);
            const path = parsed.pathname.replace(/^\/api/, "");

            if (path === "/replay/session") {
                return json(200, replaySessionWire());
            }
            if (path === `/replay/meetings/${DEMO_MEETING_ID}/safe-config`) {
                return json(200, demoSafeConfigWire());
            }
            if (path === `/replay/meetings/${DEMO_MEETING_ID}`) {
                return json(200, demoMeetingWire());
            }
            if (
                path === `/replay/meetings/${DEMO_MEETING_ID}/disagreements` ||
                path === `/replay/meetings/${DEMO_MEETING_ID}/consensus`
            ) {
                return json(200, []);
            }
            if (path === `/replay/meetings/${DEMO_MEETING_ID}/turns`) {
                return json(200, []);
            }
            if (path === "/replay/workspace-seed") {
                return json(404, {
                    detail: "replay_workspace_seed_unavailable",
                });
            }
            throw new Error(`Unexpected demo request: ${url}`);
        })
    );
    return calls;
}

beforeEach(() => {
    demoLocation.reset();
    // The recording routes render a fixed-position HUD; happy-dom reports no
    // layout viewport unless it is stubbed.
    Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        value: 1024,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
        configurable: true,
        value: 768,
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("canonical guided demo journey", () => {
    it("walks board to prepared intake to the recorded room without live reads", async () => {
        const calls = installDemoRouter();
        render(
            <DemoLayout>
                <DemoRoute />
            </DemoLayout>
        );

        expect(
            await screen.findByRole("heading", {
                name: "HDFC Ltd 7.87% 2022 debenture",
            })
        ).toBeInTheDocument();
        expect(
            within(await screen.findByTestId("tutorial-hud")).getByText(
                "Meet the board"
            )
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: /Continue/ })
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("link", { name: "Start the meeting" }));
        await waitFor(() =>
            expect(demoLocation.getPathname()).toBe("/demo/new")
        );
        expect(
            within(await screen.findByTestId("tutorial-hud")).getByText(
                "Create the recorded meeting"
            )
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: "Create recorded meeting" })
        );
        expect(await screen.findByText("Recorded intake ready")).toBeInTheDocument();
        expect(
            within(await screen.findByTestId("tutorial-hud")).getByText(
                "Open the meeting room"
            )
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Open the meeting room" })
        ).toHaveAttribute(
            "href",
            `/demo/meetings/${DEMO_MEETING_ID}?tab=chat`
        );

        fireEvent.click(screen.getByRole("link", { name: "Open the meeting room" }));
        expect(
            await screen.findByText(`Room route ${DEMO_MEETING_ID}`)
        ).toBeInTheDocument();
        expect(
            within(await screen.findByTestId("tutorial-hud")).getByText(
                "Ask the Credit Analyst"
            )
        ).toBeInTheDocument();

        expect(calls.length).toBeGreaterThan(0);
        expect(calls.every((call) => call.method === "GET")).toBe(true);
        expect(
            calls.filter((call) => call.url.startsWith(`${API}/meetings`))
        ).toHaveLength(0);
    });

    it("rejects an unknown room deep link back to the prepared board", async () => {
        installDemoRouter();
        render(
            <DemoLayout>
                <DemoRoute />
            </DemoLayout>
        );

        await screen.findByTestId("tutorial-hud");
        act(() => {
            demoLocation.navigate(
                "/demo/meetings/99999999-9999-4999-8999-999999999999"
            );
        });

        await waitFor(() => expect(demoLocation.getPathname()).toBe("/demo"));
        expect(
            await screen.findByRole("heading", {
                name: "HDFC Ltd 7.87% 2022 debenture",
            })
        ).toBeInTheDocument();
        expect(screen.queryByText(/Room route/)).not.toBeInTheDocument();
    });
});

    it("restarts playback against the same pinned session read", async () => {
        const calls = installDemoRouter();
        render(
            <DemoLayout>
                <DemoRoute />
            </DemoLayout>
        );

        await screen.findByTestId("tutorial-hud");
        await waitFor(() =>
            expect(screen.getByTestId("tutorial-hud")).toHaveAttribute(
                "data-state",
                "shown"
            )
        );
        fireEvent.click(screen.getByLabelText("Explore recording"));
        fireEvent.click(
            screen.getByRole("button", { name: "Restart recording" })
        );

        await screen.findByTestId("tutorial-hud");
        expect(
            calls.filter((call) => call.url.endsWith("/replay/session"))
        ).toHaveLength(1);
        expect(
            calls.filter((call) => call.url.includes("/replay/workspace-seed"))
        ).toHaveLength(1);
    });

    it("keeps the tutorial objective while the demo settings page is open", async () => {
        const calls = installDemoRouter();
        render(
            <DemoLayout>
                <DemoRoute />
            </DemoLayout>
        );

        await screen.findByTestId("tutorial-hud");
        fireEvent.click(screen.getByRole("link", { name: "Demo settings" }));

        expect(
            await screen.findByRole("heading", {
                name: "Settings in the public demo",
            })
        ).toBeInTheDocument();
        // The board objective has no anchor on this screen, so the HUD
        // collapses to the compact bar instead of guessing a position.
        expect(
            await screen.findByTestId("tutorial-hud-compact")
        ).toBeInTheDocument();
        expect(screen.queryByTestId("tutorial-hud")).not.toBeInTheDocument();
        expect(
            screen.getByText(/Provider setup is operator-only/i)
        ).toBeInTheDocument();
        expect(
            screen.queryByLabelText(/api key/i)
        ).not.toBeInTheDocument();
        expect(
            calls.filter((call) => call.url.endsWith("/replay/session"))
        ).toHaveLength(1);
    });

    it("collapses and restores the card without moving the journey", async () => {
        installDemoRouter();
        render(
            <DemoLayout>
                <DemoRoute />
            </DemoLayout>
        );

        const card = await screen.findByTestId("tutorial-hud");
        await waitFor(() => expect(card).toHaveAttribute("data-state", "shown"));
        expect(within(card).getByText("Meet the board")).toBeInTheDocument();
        fireEvent.click(within(card).getByLabelText("Explore recording"));
        fireEvent.click(screen.getByRole("button", { name: "Hide" }));

        expect(screen.queryByTestId("tutorial-hud")).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Show tips" })
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Show tips" }));
        expect(
            within(await screen.findByTestId("tutorial-hud")).getByText(
                "Meet the board"
            )
        ).toBeInTheDocument();
    });
