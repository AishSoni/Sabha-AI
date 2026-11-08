// @vitest-environment jsdom
/**
 * Demo knowledge-stack integration (spec-25).
 *
 * The shared stack, editor, document, and picker screens are bound to the
 * browser-memory adapter. These tests keep every request on the replay surface
 * and never exercise the native upload path.
 */
import {
    act,
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
import DemoStacksPage from "@/app/demo/knowledge-stacks/page";
import DemoNewStackPage from "@/app/demo/knowledge-stacks/new/page";
import { DemoKnowledgeStackRoute } from "@/app/demo/knowledge-stacks/[id]/stack-route";
import {
    DEMO_MEETING_ID,
    demoSafeConfigWire,
    demoMeetingWire,
    replaySessionWire,
} from "../fixtures/demo/journey";
import type {
    ReplayAsset,
    ReplayClaim,
} from "@/features/meetings/runtime/contract";
import { demoWorkspaceSeedEnvelope } from "../fixtures/demo/workspace";

const API = "http://localhost:8000/api";
const RECORDED_SAMPLE_TEXT =
    "# Shared fact sheet\n\nNo executable price, yield, or secondary-market liquidity.\n";

type DemoSessionTestWire = Omit<
    ReturnType<typeof replaySessionWire>,
    "assets" | "claims"
> & {
    assets: ReplayAsset[];
    claims: ReplayClaim[];
};

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
            const match = /^\/demo\/knowledge-stacks\/([^/]+)$/.exec(pathname);
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
    if (pathname === "/demo/knowledge-stacks") return <DemoStacksPage />;
    if (pathname === "/demo/knowledge-stacks/new") return <DemoNewStackPage />;
    const match = /^\/demo\/knowledge-stacks\/([^/]+)$/.exec(pathname);
    if (match) {
        return <DemoKnowledgeStackRoute stackId={match[1]!} />;
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

function installDemoRouter(
    seedStatus = 200,
    session: DemoSessionTestWire = replaySessionWire() as DemoSessionTestWire
) {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: unknown, init?: RequestInit) => {
            const url = String(input);
            calls.push({ url, method: init?.method ?? "GET" });
            if (
                url ===
                "https://cdn.example.test/replay/hdfc-v007-shared-fact-sheet.md"
            ) {
                const bytes = new TextEncoder().encode(RECORDED_SAMPLE_TEXT);
                return {
                    ok: true,
                    status: 200,
                    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
                    headers: {
                        get: (name: string) =>
                            name.toLowerCase() === "content-type"
                                ? "text/markdown"
                                : name.toLowerCase() === "content-length"
                                  ? String(bytes.byteLength)
                                  : null,
                    },
                } as unknown as Response;
            }
            const parsed = new URL(url);
            const path = parsed.pathname.replace(/^\/api/, "");
            if (path === "/replay/session") return json(200, session);
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
                    return json(seedStatus, {
                        detail: "replay_workspace_seed_unavailable",
                    });
                }
                return json(200, demoWorkspaceSeedEnvelope());
            }
            throw new Error(`Unexpected demo request: ${url}`);
        })
    );
    return calls;
}

function sessionWithRecordedExample() {
    const session = replaySessionWire();
    const assets: ReplayAsset[] = [
        {
            asset_id: "shared-fact-sheet",
            storage_path: "assets/shared/hdfc-v007-shared-fact-sheet.md",
            media_type: "text/markdown",
            sha256:
                "c963852414676f57ba5be08233fab709f94d56343482c9316b7b7dda8a43f4b7",
            size: 80,
            locator: "assets/shared/hdfc-v007-shared-fact-sheet.md",
            public_url:
                "https://cdn.example.test/replay/hdfc-v007-shared-fact-sheet.md",
            source: "Demo-authored input",
            capture_date: "2026-10-16",
            rights: "Demo-authored for this replay.",
            authored: true,
            public_demo: true,
            extraction: null,
        },
    ];
    const claims: ReplayClaim[] = [
        {
            claim_id: "C10",
            kind: "unknown",
            text: "The meeting record contains no executable price or yield.",
            evidence_asset_id: "shared-fact-sheet",
            locator: "Shared fact sheet, What is not established",
            excerpt: "No executable price, yield, or secondary-market liquidity",
            source_url: null,
            source_title: "Shared fact sheet",
            capture_date: null,
        },
    ];
    return { ...session, assets, claims };
}

async function renderAt(pathname: string) {
    demoLocation.navigate(pathname);
    render(
        <DemoLayout>
            <DemoRoute />
        </DemoLayout>
    );
}

beforeEach(() => {
    demoLocation.reset();
    verifySample.mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("demo knowledge stacks", () => {
    it("lists seeded stacks with real counts and assignments without live calls", async () => {
        const calls = installDemoRouter();
        await renderAt("/demo/knowledge-stacks");

        expect(
            await screen.findByRole("heading", { name: "Knowledge Stacks" })
        ).toBeInTheDocument();
        expect(await screen.findByText("Issuer fact sheet")).toBeInTheDocument();
        expect(screen.getAllByText(/1 document/)).toHaveLength(4);
        expect(screen.getAllByText(/1 ready/)).toHaveLength(4);
        expect(
            screen.getAllByText(/Assigned to The Credit Analyst/).length
        ).toBeGreaterThan(0);
        expect(calls.every((call) => call.url.startsWith(`${API}/replay/`))).toBe(
            true
        );
        expect(
            calls.some((call) => /\/(knowledge_stacks|documents)(\/|$)/.test(call.url))
        ).toBe(false);
    });

    it("adds an approved sample through the restricted picker and never renders a file input", async () => {
        installDemoRouter();
        await renderAt("/demo/knowledge-stacks/shared-fact-sheet");

        expect(
            await screen.findByRole("heading", { name: "Issuer fact sheet" })
        ).toBeInTheDocument();
        expect(
            (await screen.findAllByText("hdfc-v007-shared-fact-sheet.md")).length
        ).toBeGreaterThan(0);
        expect(screen.getByText(/Ready \(4 chunks\)/)).toBeInTheDocument();
        expect(document.querySelector('input[type="file"]')).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Add sample" }));
        const dialog = await screen.findByRole("dialog");
        expect(
            within(dialog).getByText(/Your own files\s+are never opened/)
        ).toBeInTheDocument();
        fireEvent.click(
            within(dialog).getByRole("radio", { name: /credit-evidence\.md/ })
        );
        fireEvent.click(within(dialog).getByRole("button", { name: "Add sample" }));

        await waitFor(() =>
            expect(screen.getAllByText("credit-evidence.md").length).toBeGreaterThan(
                0
            )
        );
        expect(
            await screen.findByText("Ready (2 chunks)", {}, { timeout: 3000 })
        ).toBeInTheDocument();
        expect(verifySample).toHaveBeenCalledTimes(1);
    });

    it("fails a sample once and retries the same row to ready", async () => {
        installDemoRouter();
        vi.spyOn(window, "confirm").mockReturnValue(true);
        await renderAt("/demo/knowledge-stacks/downside-worksheet");
        await screen.findByRole("heading", { name: "Downside worksheet" });

        // The downside worksheet is seeded as a ready document. Remove it so the
        // sample failure and retry path can run in this stack.
        await screen.findAllByText("downside-worksheet.md");
        fireEvent.click(
            screen.getByRole("button", {
                name: "Delete downside-worksheet.md",
            })
        );
        await waitFor(() =>
            expect(
                screen.queryByRole("button", {
                    name: "Delete downside-worksheet.md",
                })
            ).not.toBeInTheDocument()
        );

        fireEvent.click(screen.getByRole("button", { name: "Add sample" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.click(
            within(dialog).getByRole("radio", {
                name: /downside-worksheet\.md/,
            })
        );
        fireEvent.click(within(dialog).getByRole("button", { name: "Add sample" }));

        expect(await screen.findByText("Failed", {}, { timeout: 3000 })).toBeInTheDocument();
        const retry = screen.getByRole("button", {
            name: "Retry downside-worksheet.md",
        });
        fireEvent.click(retry);

        expect(
            await screen.findByText("Ready (3 chunks)", {}, { timeout: 3000 })
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", {
                name: "Retry downside-worksheet.md",
            })
        ).not.toBeInTheDocument();
        expect(screen.getAllByText("downside-worksheet.md")).toHaveLength(2);
    });

    it("removes a ready document after confirmation and revokes its eligibility", async () => {
        installDemoRouter();
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
        await renderAt("/demo/knowledge-stacks/shared-fact-sheet");
        await screen.findAllByText("hdfc-v007-shared-fact-sheet.md");

        fireEvent.click(
            screen.getByRole("button", {
                name: "Delete hdfc-v007-shared-fact-sheet.md",
            })
        );

        await waitFor(() =>
            expect(
                screen.queryByRole("button", {
                    name: "Delete hdfc-v007-shared-fact-sheet.md",
                })
            ).not.toBeInTheDocument()
        );
        expect(confirm).toHaveBeenCalledWith(
            expect.stringMatching(/demo meeting and its documents are unchanged/i)
        );
        expect(screen.getByText(/0 documents · 0 ready/)).toBeInTheDocument();
    });

    it("links a sample to its explicit recorded claim and never performs a live retrieval", async () => {
        const calls = installDemoRouter(200, sessionWithRecordedExample());
        await renderAt("/demo/knowledge-stacks/shared-fact-sheet");

        expect(
            await screen.findByText("Recorded example using the demo input")
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "The meeting record contains no executable price or yield."
            )
        ).toBeInTheDocument();
        expect(screen.getByText(/Claim C10/)).toBeInTheDocument();
        expect(
            screen.getByRole("button", {
                name: /Preview demo example/,
            })
        ).toBeInTheDocument();
        expect(
            calls.every(
                (call) =>
                    call.url.startsWith(`${API}/replay/`) &&
                    !/\/(knowledge_stacks|documents)(\/|$)/.test(call.url)
            )
        ).toBe(true);
    });

    it("opens the shared bounded preview for the recorded example", async () => {
        const calls = installDemoRouter(200, sessionWithRecordedExample());
        await renderAt("/demo/knowledge-stacks/shared-fact-sheet");

        fireEvent.click(
            await screen.findByRole("button", {
                name: "Preview demo example: hdfc-v007-shared-fact-sheet.md",
            })
        );

        const dialog = await screen.findByRole("dialog");
        expect(
            await within(dialog).findByText("Shared fact sheet")
        ).toBeInTheDocument();
        expect(
            await within(dialog).findAllByText(/No executable price, yield/)
        ).not.toHaveLength(0);
        expect(
            calls.filter(
                (call) =>
                    call.url ===
                    "https://cdn.example.test/replay/hdfc-v007-shared-fact-sheet.md"
            )
        ).toHaveLength(1);
        expect(
            calls.some((call) => /\/(knowledge_stacks|documents)(\/|$)/.test(call.url))
        ).toBe(false);
    });

    it("discards an unsaved stack name draft when the workspace is fully reset", async () => {
        installDemoRouter();
        await renderAt("/demo/knowledge-stacks/shared-fact-sheet");

        const name = (await screen.findByLabelText("Name")) as HTMLInputElement;
        expect(name.value).toBe("Issuer fact sheet");
        fireEvent.change(name, { target: { value: "Discarded draft" } });
        expect(name.value).toBe("Discarded draft");

        fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));

        await waitFor(() =>
            expect(
                (screen.getByLabelText("Name") as HTMLInputElement).value
            ).toBe("Issuer fact sheet")
        );
        expect(
            screen.getByRole("heading", { name: "Issuer fact sheet" })
        ).toBeInTheDocument();
    });

    it("creates and renames a local stack, then deletes it with its documents", async () => {
        installDemoRouter();
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
        await renderAt("/demo/knowledge-stacks/new");

        await screen.findByRole("heading", { name: "New knowledge stack" });
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Temporary research" },
        });
        fireEvent.change(screen.getByLabelText("Description"), {
            target: { value: "Practice only." },
        });
        fireEvent.click(screen.getByRole("button", { name: "Create stack" }));

        await waitFor(() =>
            expect(demoLocation.getPathname()).toMatch(
                /^\/demo\/knowledge-stacks\/practice-stack-/
            )
        );
        expect(
            await screen.findByRole("heading", { name: "Temporary research" })
        ).toBeInTheDocument();

        const name = screen.getByLabelText("Name");
        fireEvent.change(name, { target: { value: "Renamed research" } });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        expect(
            await screen.findByRole("heading", { name: "Renamed research" })
        ).toBeInTheDocument();

        act(() => demoLocation.navigate("/demo/knowledge-stacks"));
        expect(await screen.findByText("Renamed research")).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole("button", { name: "Delete Renamed research" })
        );

        await waitFor(() =>
            expect(
                screen.queryByText("Renamed research")
            ).not.toBeInTheDocument()
        );
        expect(confirm).toHaveBeenCalledWith(
            expect.stringMatching(/documents will be revoked first/i)
        );
    });

    it("fails safely for an unknown stack and a legacy workspace", async () => {
        installDemoRouter();
        await renderAt("/demo/knowledge-stacks/missing-stack");
        expect(
            await screen.findByRole("heading", {
                name: "This knowledge stack is not available",
            })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Back to knowledge stacks" })
        ).toHaveAttribute("href", "/demo/knowledge-stacks");
    });

    it("closes the knowledge routes when the workspace seed is unavailable", async () => {
        installDemoRouter(404);
        await renderAt("/demo/knowledge-stacks");
        expect(
            await screen.findByRole("heading", {
                name: "Knowledge unavailable",
            })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Back to the demo board" })
        ).toHaveAttribute("href", "/demo");
    });
});
