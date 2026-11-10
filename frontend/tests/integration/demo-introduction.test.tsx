// @vitest-environment jsdom
/**
 * Demo introduction entry policy (spec-41).
 *
 * jsdom cannot create a WebGL context, so these assertions exercise the
 * required readable fallback that preserves the same ordered moments and
 * controls.
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

function installRouter(options: { safeConfig?: Record<string, unknown> } = {}) {
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
                    options.safeConfig ?? demoSafeConfigWire()
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
        name: "One question. Different minds.",
    });
}

describe("demo introduction", () => {
    it("gates the workspace until Enter the demo is activated", async () => {
        installRouter();
        const heading = await renderIntro();

        expect(heading).toHaveFocus();
        expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Back" })
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Continue" })
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("navigation", { name: "Demo workspace" })
        ).not.toBeInTheDocument();
        expect(screen.queryByTestId("tutorial-hud")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("heading", { name: "Demo board" })
        ).not.toBeInTheDocument();

        expect(
            screen.getByRole("heading", {
                name: "See where they disagree.",
            })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("heading", {
                name: "Choose. Question. Explore.",
            })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("heading", {
                name: "Clear facts. Different judgments.",
            })
        ).toBeInTheDocument();

        const enter = screen.getByRole("button", { name: "Enter the demo" });
        await waitFor(() => expect(enter).toBeEnabled());
        fireEvent.click(enter);

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
                name: "One question. Different minds.",
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

    it("shows a composed entry failure instead of a standalone loading card", async () => {
        installRouter({ safeConfig: {} });
        await renderIntro();
        expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Enter the demo" })
        ).toBeDisabled();

        fireEvent.click(
            screen.getByRole("button", { name: "Skip introduction" })
        );

        expect(
            await screen.findByRole("heading", {
                name: "The demo could not open.",
            })
        ).toBeInTheDocument();
        expect(
            screen.getByText("The demo details are incomplete.")
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
        expect(screen.queryByText("Loading demo")).not.toBeInTheDocument();
        expect(
            screen.queryByText("Loading demo details")
        ).not.toBeInTheDocument();
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
                name: "One question. Different minds.",
            })
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("heading", { name: "Demo board" })
        ).toBeInTheDocument();
    });
});
