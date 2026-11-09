// @vitest-environment jsdom
/**
 * Demo introduction entry policy (spec-41).
 *
 * The introduction is the only thing exposed after the pinned session and
 * safe config are ready. It preserves the requested route, hides the competing
 * workspace chrome, and can be revisited without remounting the workspace.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoLayout from "@/app/demo/layout";
import DemoBoardPage from "@/app/demo/page";
import {
    DEMO_MEETING_ID,
    demoSafeConfigWire,
    replaySessionWire,
} from "../fixtures/demo/journey";

vi.mock("next/navigation", () => ({
    usePathname: () => "/demo",
    useSearchParams: () => new URLSearchParams(""),
    useParams: () => ({}),
    useRouter: () => ({
        push: () => undefined,
        replace: () => undefined,
        back: () => undefined,
    }),
}));

vi.mock("next/link", async () => {
    const React = await import("react");
    return {
        default: function MockLink({
            href,
            children,
            ...props
        }: {
            href: string;
            children?: ReactNode;
        }) {
            return React.createElement("a", { href, ...props }, children);
        },
    };
});

function json(body: unknown, status = 200): Response {
    return {
        ok: status < 400,
        status,
        json: async () => body,
    } as unknown as Response;
}

function installRouter(options: { board?: boolean } = {}) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: unknown) => {
            const url = String(input);
            const path = new URL(url).pathname.replace(/^\/api/, "");
            if (path === "/replay/session") {
                return json(replaySessionWire());
            }
            if (path === `/replay/meetings/${DEMO_MEETING_ID}/safe-config`) {
                return json(
                    options.board === false ? {} : demoSafeConfigWire()
                );
            }
            if (path === "/replay/workspace-seed") {
                return json({ detail: "seed unavailable" }, 404);
            }
            throw new Error(`Unexpected demo request: ${url}`);
        })
    );
}

beforeEach(() => {
    window.sessionStorage.clear();
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

async function renderIntro() {
    render(
        <DemoLayout>
            <DemoBoardPage />
        </DemoLayout>
    );
    return screen.findByRole("heading", {
        name: "One director. Three expert minds.",
    });
}

describe("demo introduction", () => {
    it("gates the workspace until the four steps are acknowledged", async () => {
        installRouter();
        const heading = await renderIntro();

        expect(heading).toHaveFocus();
        expect(
            screen.getByText("Step 1 of 4")
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Back" })
        ).toBeDisabled();
        expect(
            screen.queryByRole("navigation", { name: "Demo workspace" })
        ).not.toBeInTheDocument();
        expect(screen.queryByTestId("tutorial-hud")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("heading", { name: "Demo board" })
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(
            screen.getByRole("heading", {
                name: "Disagreement you can inspect.",
            })
        ).toBeInTheDocument();
        expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(
            screen.getByRole("heading", {
                name: "One director. Three expert minds.",
            })
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(
            screen.getByRole("heading", { name: "A HDFC Bond Review Demo" })
        ).toBeInTheDocument();
        expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(
            screen.getByRole("heading", { name: "What to try" })
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Enter the demo" }));

        expect(
            await screen.findByRole("heading", { name: "Demo board" })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("navigation", { name: "Demo workspace" })
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(document.getElementById("main-content")).toHaveFocus()
        );
    });

    it("keeps the workspace mounted and hides its HUD on a revisit", async () => {
        installRouter();
        await renderIntro();
        fireEvent.click(
            screen.getByRole("button", { name: "Skip introduction" })
        );
        await screen.findByRole("heading", { name: "Demo board" });

        fireEvent.click(
            screen.getByRole("button", { name: "How this demo works" })
        );

        expect(
            screen.getByRole("heading", {
                name: "One director. Three expert minds.",
            })
        ).toBeInTheDocument();
        expect(screen.queryByTestId("tutorial-hud")).not.toBeInTheDocument();
        expect(
            document.querySelector('[aria-hidden="true"]')
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: "Skip introduction" })
        );
        expect(
            await screen.findByRole("heading", { name: "Demo board" })
        ).toBeInTheDocument();
    });

    it("shows an explicit board metadata failure instead of endless loading", async () => {
        installRouter({ board: false });
        await renderIntro();
        fireEvent.click(
            screen.getByRole("button", { name: "Skip introduction" })
        );

        expect(
            await screen.findByRole("heading", {
                name: "Demo board unavailable",
            })
        ).toBeInTheDocument();
        expect(screen.getByText("Try again")).toBeInTheDocument();
        expect(screen.queryByText("Loading demo…")).not.toBeInTheDocument();
    });

    it("does not reopen the introduction for an immediate reset", async () => {
        installRouter();
        await renderIntro();
        fireEvent.click(
            screen.getByRole("button", { name: "Skip introduction" })
        );
        await screen.findByRole("heading", { name: "Demo board" });

        fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));

        expect(
            screen.queryByRole("heading", {
                name: "One director. Three expert minds.",
            })
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("heading", { name: "Demo board" })
        ).toBeInTheDocument();
    });
});
