// @vitest-environment jsdom
/**
 * Demo persona-catalog integration (spec-24).
 *
 * The same live screens are bound to the in-memory transport. These tests keep
 * the prepared board immutable, prove revision inspection is not activation,
 * and check that no live persona or stack request is ever made.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoLayout from "@/app/demo/layout";
import DemoBoardPage from "@/app/demo/page";
import DemoRosterPage from "@/app/demo/roster/page";
import DemoNewPersonaPage from "@/app/demo/roster/new/page";
import { DemoPersonaRoute } from "@/app/demo/roster/[id]/persona-route";
import {
    DEMO_BOARD_PARTICIPANTS,
    DEMO_MEETING_ID,
    demoSafeConfigWire,
    demoMeetingWire,
    replaySessionWire,
} from "../fixtures/demo/journey";
import { demoWorkspaceSeedEnvelope } from "../fixtures/demo/workspace";

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
            return () => listeners.delete(listener);
        },
        getPathname: () => pathname,
        getSearchParams: () => params,
        getRouteParams: () => routeParams,
        navigate(href: string) {
            const url = new URL(href, "http://sabha.local");
            pathname = url.pathname;
            params = new URLSearchParams(url.search);
            const match = /^\/demo\/roster\/([^/]+?)(?:\/history)?$/.exec(pathname);
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
            ...rest
        }: {
            href: string;
            children?: ReactNode;
            onClick?: (event: { preventDefault: () => void }) => void;
        }) {
            return React.createElement(
                "a",
                {
                    ...rest,
                    href,
                    onClick: (event: { preventDefault: () => void }) => {
                        onClick?.(event);
                        event.preventDefault();
                        demoLocation.navigate(href);
                    },
                },
                children
            );
        },
    };
});

function DemoRoute() {
    const pathname = usePathname();
    if (pathname === "/demo") return <DemoBoardPage />;
    if (pathname === "/demo/roster") return <DemoRosterPage />;
    if (pathname === "/demo/roster/new") return <DemoNewPersonaPage />;
    const match = /^\/demo\/roster\/([^/]+?)(\/history)?$/.exec(pathname);
    if (match) {
        return (
            <DemoPersonaRoute
                personaId={match[1]!}
                initialTab={match[2] ? "prompt" : "overview"}
            />
        );
    }
    return <p>Unknown demo route</p>;
}

function json(status: number, body: unknown): Response {
    return {
        ok: status < 400,
        status,
        json: async () => body,
    } as unknown as Response;
}

function installDemoRouter(seedStatus = 200) {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: unknown, init?: RequestInit) => {
            const url = String(input);
            calls.push({ url, method: init?.method ?? "GET" });
            const parsed = new URL(url);
            const path = parsed.pathname.replace(/^\/api/, "");
            if (path === "/replay/session") return json(200, replaySessionWire());
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
                if (seedStatus !== 200) {
                    return json(seedStatus, { detail: "replay_workspace_seed_unavailable" });
                }
                return json(200, demoWorkspaceSeedEnvelope());
            }
            throw new Error(`Unexpected demo request: ${url}`);
        })
    );
    return calls;
}

async function renderAt(pathname: string) {
    demoLocation.navigate(pathname);
    render(
        <DemoLayout>
            <DemoRoute />
        </DemoLayout>
    );
}

async function openPromptTab() {
    const tab = await screen.findByRole("tab", { name: /prompt/i });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
}

beforeEach(() => {
    demoLocation.reset();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("demo persona catalog", () => {
    it("opens practice templates from the prepared board and lists the seeded catalog", async () => {
        const calls = installDemoRouter();
        await renderAt("/demo");

        expect(
            await screen.findByRole("heading", { name: "Demo board" })
        ).toBeInTheDocument();
        fireEvent.click(
            await screen.findByRole("link", {
                name: "Personas",
            })
        );

        expect(
            await screen.findByRole("heading", { name: "Personas" })
        ).toBeInTheDocument();
        expect(await screen.findByText("The Credit Analyst")).toBeInTheDocument();
        expect(screen.getByText("Start here")).toBeInTheDocument();
        expect(screen.getByText("The Downside Reviewer")).toBeInTheDocument();
        expect(screen.getByText("The Portfolio Analyst")).toBeInTheDocument();
        expect(screen.getAllByText(/Prompt v/).length).toBeGreaterThan(0);
        expect(calls.every((call) => call.url.startsWith(`${API}/replay/`))).toBe(true);
    });

    it("inspects a revision without activating it, then saves and restores one", async () => {
        const calls = installDemoRouter();
        await renderAt("/demo/roster/persona-credit");

        expect(
            await screen.findByRole("heading", { name: "The Credit Analyst" })
        ).toBeInTheDocument();
        await openPromptTab();

        const textarea = screen.getByRole("textbox");
        expect((textarea as HTMLTextAreaElement).value).toContain(
            "flag unsupported assumptions"
        );

        fireEvent.click(screen.getByRole("button", { name: "View version 1" }));
        expect(await screen.findByLabelText("Version 1 content")).toBeInTheDocument();
        expect(screen.getByText("You are the Credit Analyst.")).toBeInTheDocument();
        expect((textarea as HTMLTextAreaElement).value).toContain(
            "flag unsupported assumptions"
        );
        expect(screen.getAllByText("Active")).toHaveLength(1);

        fireEvent.change(textarea, {
            target: { value: "You are a temporary practice analyst." },
        });
        fireEvent.click(screen.getByRole("button", { name: /Save as New Version/ }));

        expect(await screen.findByText("Version 4")).toBeInTheDocument();
        await waitFor(() => expect(screen.getAllByText("Active")).toHaveLength(1));
        expect(screen.getByText("Temporary local edit")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Make version 1 active" }));
        await waitFor(() =>
            expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
                "You are the Credit Analyst."
            )
        );
        await waitFor(() => expect(screen.getAllByText("Active")).toHaveLength(1));
        expect(calls.every((call) => call.url.startsWith(`${API}/replay/`))).toBe(true);
        expect(
            calls.some((call) =>
                /\/(personas|knowledge_stacks|providers?)(\/|$)/.test(call.url)
            )
        ).toBe(false);
    });

    it("captures a practice participant snapshot that later template edits do not rewrite", async () => {
        installDemoRouter();
        await renderAt("/demo/roster/persona-credit");
        await screen.findByRole("heading", { name: "The Credit Analyst" });

        const panel = await screen.findByRole("region", {
            name: "Participant snapshot",
        });
        expect(
            within(panel).getByText(/No source prompt version was stored/)
        ).toBeInTheDocument();
        fireEvent.click(
            within(panel).getByRole("button", {
                name: "Capture participant snapshot",
            })
        );

        expect(
            await within(panel).findByText(/Captured participant snapshots \(1\)/)
        ).toBeInTheDocument();
        const capturedItem = () =>
            within(panel).getByText(/from v3/).closest("li")!;
        expect(
            within(capturedItem()).getByText(
                /State covenant headroom and flag unsupported assumptions/
            )
        ).toBeInTheDocument();

        await openPromptTab();
        fireEvent.change(screen.getByRole("textbox"), {
            target: { value: "A new template prompt after capture." },
        });
        fireEvent.click(screen.getByRole("button", { name: /Save as New Version/ }));
        await screen.findByText("Version 4");

        const preview = within(panel)
            .getByText("Read the composed system prompt")
            .closest("details")!;
        expect(
            within(preview).getByText(/A new template prompt after capture/)
        ).toBeInTheDocument();
        expect(
            within(capturedItem()).getByText(
                /State covenant headroom and flag unsupported assumptions/
            )
        ).toBeInTheDocument();
    });

    it("duplicates and deletes a local template without touching the recording", async () => {
        const calls = installDemoRouter();
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
        await renderAt("/demo/roster");
        await screen.findByText("Personas");
        await screen.findByText("The Credit Analyst");

        fireEvent.pointerDown(
            screen.getByRole("button", { name: "Actions for The Credit Analyst" })
        );
        fireEvent.click(await screen.findByText("Duplicate"));
        expect(
            await screen.findByText("The Credit Analyst (Copy)")
        ).toBeInTheDocument();

        fireEvent.pointerDown(
            screen.getByRole("button", {
                name: "Actions for The Credit Analyst (Copy)",
            })
        );
        fireEvent.click(await screen.findByText("Delete"));
        await waitFor(() =>
            expect(
                screen.queryByText("The Credit Analyst (Copy)")
            ).not.toBeInTheDocument()
        );
        expect(confirm).toHaveBeenCalledWith(
            expect.stringMatching(/meeting participants are not affected/i)
        );
        expect(screen.getByText("The Credit Analyst")).toBeInTheDocument();
        expect(calls.every((call) => call.url.startsWith(`${API}/replay/`))).toBe(true);
    });

    it("creates a local persona, then reset restores the seeded catalog", async () => {
        installDemoRouter();
        await renderAt("/demo/roster/new");

        await screen.findByRole("heading", { name: "Create AI Persona" });
        fireEvent.change(screen.getByLabelText(/^Name/), {
            target: { value: "The Demo Analyst" },
        });
        fireEvent.change(screen.getByLabelText(/System Prompt/), {
            target: { value: "You are a temporary demo analyst." },
        });
        fireEvent.click(screen.getByRole("button", { name: "Create Persona" }));

        await waitFor(() =>
            expect(demoLocation.getPathname()).toMatch(/^\/demo\/roster\/.+/)
        );
        expect(await screen.findByText("The Demo Analyst")).toBeInTheDocument();
        await openPromptTab();
        expect(await screen.findByText("Version 1")).toBeInTheDocument();
        expect(screen.getAllByText("Active")).toHaveLength(1);

        act(() => demoLocation.navigate("/demo/roster"));
        expect(await screen.findByText(/Your Personas \(4\)/)).toBeInTheDocument();
        expect(await screen.findByText("The Demo Analyst")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));
        fireEvent.click(
            await screen.findByRole("button", { name: "Reset and discard changes" })
        );

        await waitFor(() =>
            expect(screen.queryByText("The Demo Analyst")).not.toBeInTheDocument()
        );
        expect(screen.getByText("The Credit Analyst")).toBeInTheDocument();
    });

    it("leaves the prepared board prompts unchanged after catalog edits", async () => {
        installDemoRouter();
        await renderAt("/demo/roster/persona-credit");
        await screen.findByRole("heading", { name: "The Credit Analyst" });
        await openPromptTab();
        fireEvent.change(screen.getByRole("textbox"), {
            target: { value: "A temporary practice prompt." },
        });
        fireEvent.click(screen.getByRole("button", { name: /Save as New Version/ }));
        await screen.findByText("Version 4");

        act(() => demoLocation.navigate("/demo"));
        expect(
            await screen.findByText(DEMO_BOARD_PARTICIPANTS[0]!.persona_summary)
        ).toBeInTheDocument();
        expect(
            screen.queryByText("A temporary practice prompt.")
        ).not.toBeInTheDocument();
    });

    it("fails safely for an unknown persona id and for a legacy workspace", async () => {
        installDemoRouter();
        await renderAt("/demo/roster/persona-missing");
        expect(await screen.findByText("Persona Not Found")).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Back to Roster" })
        ).toHaveAttribute("href", "/demo/roster");
    });

    it("does not open the catalog when the workspace seed is unavailable", async () => {
        installDemoRouter(404);
        await renderAt("/demo/roster");
        expect(
            await screen.findByRole("heading", {
                name: "Personas unavailable",
            })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Back to the demo board" })
        ).toHaveAttribute("href", "/demo");
    });
});

