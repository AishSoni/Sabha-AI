// @vitest-environment jsdom
/**
 * Main-journey shared documents integration (spec-43).
 *
 * The prepared meeting is the single owner of added sample identity. These
 * tests prove one approved sample can be added in setup, becomes Ready through
 * the local document machine, and is then visible with the same identity and
 * readiness in the room Files tab and on the shared knowledge stack. They also
 * cover failure/retry, duplicate reselection, reset, and the no-live-request
 * boundary that replaces the removed practice flow.
 */
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoLayout from "@/app/demo/layout";
import DemoNewMeetingPage from "@/app/demo/new/page";
import DemoMeetingListPage from "@/app/demo/meetings/page";
import DemoMeetingPage from "@/app/demo/meetings/[id]/page";
import { DemoKnowledgeStackRoute } from "@/app/demo/knowledge-stacks/[id]/stack-route";
import {
    DEMO_MEETING_ID,
    demoSafeConfigWire,
    demoMeetingWire,
    replaySessionWire,
} from "../fixtures/demo/journey";
import { demoWorkspaceSeedEnvelope } from "../fixtures/demo/workspace";
import { acknowledgeDemoIntro } from "../support/demo-intro";

const API = "http://localhost:8000/api";

const verifySample = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/features/knowledge/local/sample-source", async (importOriginal) => {
    const actual =
        await importOriginal<
            typeof import("@/features/knowledge/local/sample-source")
        >();
    return { ...actual, verifySampleSource: verifySample };
});

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
    if (pathname === "/demo/new") return <DemoNewMeetingPage />;
    if (pathname === "/demo/meetings") return <DemoMeetingListPage />;
    const stackMatch = /^\/demo\/knowledge-stacks\/([^/]+)$/.exec(pathname);
    if (stackMatch) {
        return <DemoKnowledgeStackRoute stackId={stackMatch[1]} />;
    }
    const match = /^\/demo\/meetings\/([^/]+)$/.exec(pathname);
    if (match) return <DemoMeetingPage />;
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
                const wire = replaySessionWire();
                return json(200, {
                    ...wire,
                    capabilities: {
                        ...wire.capabilities,
                        documents: true,
                    },
                });
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
            if (path === `/replay/meetings/${DEMO_MEETING_ID}/documents`) {
                return json(200, []);
            }
            if (path === "/replay/workspace-seed") {
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

async function openSetup() {
    await renderAt("/demo/new");
    await screen.findByRole("heading", { name: "Create meeting" });
    await screen.findByRole("heading", { name: "Added samples" });
    expect(document.querySelector("input[type=file]")).toBeNull();
}

async function addSample(fileName: RegExp = /shared-fact-sheet\.md/) {
    fireEvent.click(
        screen.getByRole("button", { name: "Add approved sample" })
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: fileName }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add sample" }));
    await waitFor(() => expect(verifySample).toHaveBeenCalled());
}

async function openRoomFromSetup() {
    fireEvent.click(
        screen.getByRole("button", { name: "Create meeting" })
    );
    await screen.findByText("Meeting created");
    fireEvent.click(
        screen.getByRole("link", { name: /Open the meeting room/ })
    );
    await screen.findByRole("tab", { name: "Files" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Files" }));
}

beforeEach(() => {
    acknowledgeDemoIntro();
    demoLocation.reset();
    verifySample.mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("main-journey shared documents", () => {
    it("adds an approved sample in setup and shows the same ready document in the room", async () => {
        const calls = installDemoRouter();
        await openSetup();

        await addSample();
        await waitFor(
            () =>
                expect(
                    screen.getByText(/Ready \(4 chunks\)/)
                ).toBeInTheDocument(),
            { timeout: 3000 }
        );
        expect(screen.getByText("hdfc-v007-shared-fact-sheet.md")).toBeInTheDocument();

        await openRoomFromSetup();
        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Added to this demo" })
            ).toBeInTheDocument()
        );
        expect(screen.getByText("hdfc-v007-shared-fact-sheet.md")).toBeInTheDocument();
        expect(screen.getByText(/Ready \(4 chunks\)/)).toBeInTheDocument();
        expect(screen.getByText(/Added in this browser/)).toBeInTheDocument();

        expect(calls.every((call) => call.method === "GET")).toBe(true);
        expect(
            calls.some((call) =>
                /\/knowledge-stacks|\/upload|\/api\/v1\/documents/.test(call.url)
            )
        ).toBe(false);
        expect(calls.every((call) => call.url.startsWith(API))).toBe(true);
    });

    it("retries the same failed sample to ready without duplicating it", async () => {
        installDemoRouter();
        await openSetup();
        await addSample(/downside-worksheet\.md/);

        await screen.findByText(/Failed/, {}, { timeout: 3000 });
        fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
        await waitFor(
            () =>
                expect(
                    screen.getByText(/Ready \(3 chunks\)/)
                ).toBeInTheDocument(),
            { timeout: 3000 }
        );
        expect(screen.queryByText(/Failed/)).not.toBeInTheDocument();
        expect(screen.getAllByText("downside-worksheet.md")).toHaveLength(1);
        expect(verifySample).toHaveBeenCalledTimes(1);
    });

    it("keeps an added sample visible on the shared stack and hides it from private stacks", async () => {
        installDemoRouter();
        await openSetup();
        await addSample();
        await screen.findByText(/Ready \(4 chunks\)/, {}, { timeout: 3000 });

        demoLocation.navigate("/demo/knowledge-stacks/shared-fact-sheet");
        await screen.findByRole("heading", { name: "Issuer fact sheet" });
        expect(
            screen.getByRole("heading", { name: "Meeting-wide documents" })
        ).toBeInTheDocument();
        expect(
            screen.getAllByText("hdfc-v007-shared-fact-sheet.md").length
        ).toBeGreaterThan(0);
        expect(screen.getAllByText(/Ready \(4 chunks\)/).length).toBeGreaterThan(
            0
        );

        demoLocation.navigate("/demo/knowledge-stacks/credit-evidence");
        await screen.findByRole("heading", { name: "Credit evidence" });
        expect(
            screen.queryByRole("heading", { name: "Meeting-wide documents" })
        ).not.toBeInTheDocument();
    });

    it("blocks duplicate reselection with a useful already-added reason", async () => {
        installDemoRouter();
        await openSetup();
        await addSample();
        await screen.findByText(/Ready \(4 chunks\)/, {}, { timeout: 3000 });

        fireEvent.click(
            screen.getByRole("button", { name: "Add approved sample" })
        );
        const dialog = await screen.findByRole("dialog");
        expect(
            within(dialog).getByRole("radio", {
                name: /shared-fact-sheet\.md/,
            })
        ).toBeDisabled();
        expect(within(dialog).getByText("Already added")).toBeInTheDocument();
    });

    it("clears added samples on a full reset without late reindexing", async () => {
        installDemoRouter();
        await openSetup();
        await addSample();
        await waitFor(() =>
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        );

        fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));
        fireEvent.click(
            screen.getByRole("button", {
                name: "Reset and discard changes",
            })
        );
        const skipIntroduction = screen.queryByRole("button", {
            name: "Skip introduction",
        });
        if (skipIntroduction) fireEvent.click(skipIntroduction);
        await waitFor(() =>
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        );

        demoLocation.navigate("/demo/new");
        await screen.findByRole("heading", { name: "Added samples" });
        expect(screen.queryByText("hdfc-v007-shared-fact-sheet.md")).not.toBeInTheDocument();
        expect(
            screen.getByText(
                "No approved sample has been added. Creating the meeting does not require one."
            )
        ).toBeInTheDocument();

        await new Promise((resolve) => setTimeout(resolve, 1200));
        expect(screen.queryByText("hdfc-v007-shared-fact-sheet.md")).not.toBeInTheDocument();
    });

    it("creates the meeting without a sample and keeps the recorded path fixed", async () => {
        const calls = installDemoRouter();
        await openSetup();
        expect(
            screen.getByText(
                "No approved sample has been added. Creating the meeting does not require one."
            )
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Create meeting" }));
        await screen.findByText("Meeting created");
        expect(
            screen.getByRole("link", { name: /Open the meeting room/ })
        ).toHaveAttribute(
            "href",
            `/demo/meetings/${DEMO_MEETING_ID}?tab=chat`
        );
        expect(calls.every((call) => call.method === "GET")).toBe(true);
    });
});
