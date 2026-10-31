// @vitest-environment jsdom
/**
 * Practice meeting integration (spec-25).
 *
 * The recorded intake route also carries an inline practice editor. These tests
 * prove one local setup is created from an approved sample, its documents
 * simulate ingestion in the shared vocabulary, the recorded creation path stays
 * intact, and local IDs never fall through to replay or live reads.
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
import {
    DEMO_MEETING_ID,
    demoSafeConfigWire,
    demoMeetingWire,
    replaySessionWire,
} from "../fixtures/demo/journey";
import { demoWorkspaceSeedEnvelope } from "../fixtures/demo/workspace";

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

async function openEditor() {
    await renderAt("/demo/new");
    await screen.findByRole("heading", { name: "Start the meeting" });
    await waitFor(() =>
        expect(
            screen.getByRole("button", { name: "Try editing this setup" })
        ).toBeEnabled()
    );
    fireEvent.click(
        screen.getByRole("button", { name: "Try editing this setup" })
    );
    await screen.findByRole("heading", {
        name: "Practice editing this setup",
    });
    expect(document.querySelector("input[type=file]")).toBeNull();
}

async function createSetup(options: { sample?: RegExp; buttonName?: string } = {}) {
    await openEditor();
    fireEvent.click(
        screen.getByRole("button", { name: "Add approved sample" })
    );
    const dialog = await screen.findByRole("dialog");
    if (options.sample) {
        fireEvent.click(
            within(dialog).getByRole("radio", { name: options.sample })
        );
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "Add sample" }));

    await screen.findByText("Selected · starts after setup is created");
    const createButton = screen.getByRole("button", {
        name: options.buttonName ?? "Create practice meeting",
    });
    // A repeated submit must not clone the setup or its prepared documents.
    fireEvent.click(createButton);
    fireEvent.click(createButton);
    await screen.findByText("Practice setup created");
    const link = screen.getByRole("link", { name: /Open practice setup/ });
    return link.getAttribute("href")!;
}

beforeEach(() => {
    demoLocation.reset();
    verifySample.mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("demo practice meetings", () => {
    it("creates one local setup from an approved sample and reports readiness", async () => {
        const calls = installDemoRouter();

        const href = await createSetup();
        expect(href.startsWith("/demo/meetings/local-")).toBe(true);
        expect(verifySample).toHaveBeenCalledTimes(1);

        fireEvent.click(
            screen.getByRole("link", { name: /Open practice setup/ })
        );

        expect(
            await screen.findByText("Captured participants")
        ).toBeInTheDocument();
        await waitFor(
            () =>
                expect(
                    screen.getByText(/Ready \(4 chunks\)/)
                ).toBeInTheDocument(),
            { timeout: 3000 }
        );
        expect(screen.getByText("The Credit Analyst")).toBeInTheDocument();
        expect(screen.getByText("The Downside Reviewer")).toBeInTheDocument();
        expect(screen.getByText("The Portfolio Analyst")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /Discard practice setup/ })
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: /Send|Generate|Vote/i })
        ).not.toBeInTheDocument();

        expect(calls.every((call) => call.method === "GET")).toBe(true);
        expect(
            calls.some((call) =>
                /\/documents|\/knowledge-stacks|\/upload/.test(call.url)
            )
        ).toBe(false);
        expect(
            calls.every((call) => call.url.startsWith(API))
        ).toBe(true);
    });

    it("retries the same failed preparation to ready without duplicating it", async () => {
        installDemoRouter();
        await createSetup({ sample: /downside-worksheet\.md/ });

        fireEvent.click(
            screen.getByRole("link", { name: /Open practice setup/ })
        );
        await screen.findByText(/Failed/, {}, { timeout: 3000 });
        const failedRow = screen.getByText(/Failed/).closest("div");
        expect(failedRow).not.toBeNull();

        fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
        await waitFor(
            () =>
                expect(
                    screen.getByText(/Ready \(3 chunks\)/)
                ).toBeInTheDocument(),
            { timeout: 3000 }
        );
        expect(screen.queryByText(/Failed/)).not.toBeInTheDocument();
    });

    it("lists practice setups separately and discards them with revocation", async () => {
        installDemoRouter();
        vi.spyOn(window, "confirm").mockReturnValue(true);
        await createSetup();

        fireEvent.click(
            screen.getByRole("button", { name: "Back to recorded intake" })
        );
        fireEvent.click(screen.getByRole("link", { name: "Meetings" }));

        expect(
            await screen.findByRole("heading", { name: "Practice setups" })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /Open practice setup/ })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Active and ended" })
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: "Discard setup" })
        );

        await waitFor(() =>
            expect(
                screen.getByText(/No practice setup in this tab/)
            ).toBeInTheDocument()
        );
        expect(window.confirm).toHaveBeenCalled();
    });

    it("keeps the canonical recorded creation path after practice editing", async () => {
        installDemoRouter();
        await openEditor();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

        fireEvent.click(
            screen.getByRole("button", { name: "Create recorded meeting" })
        );

        expect(
            await screen.findByText("Recorded intake ready")
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /Open the meeting room/ })
        ).toHaveAttribute("href", `/demo/meetings/${DEMO_MEETING_ID}`);
    });

    it("resolves unknown local IDs locally without replay or live lookup", async () => {
        const calls = installDemoRouter();
        await renderAt("/demo/meetings/local-missing");

        expect(
            await screen.findByRole("heading", {
                name: "This practice setup is not available",
            })
        ).toBeInTheDocument();
        expect(
            calls.some((call) => call.url.includes("local-missing"))
        ).toBe(false);
        expect(calls.every((call) => call.method === "GET")).toBe(true);
    });
});
