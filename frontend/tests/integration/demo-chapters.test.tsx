import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChapterBootstrap } from "@/app/demo/chapter-bootstrap";
import type { ReplayChapter } from "@/features/meetings/runtime/contract";

const demoLocation = vi.hoisted(() => ({
    pathname: "/demo/meetings/meeting-1",
    params: new URLSearchParams(""),
}));

const replayRun = vi.hoisted(() => ({
    checkpoint: "checkpoint-initial",
    goToChapter: vi.fn(),
    session: {
        meeting_id: "meeting-1",
        retired: false,
        chapters: [] as ReplayChapter[],
    },
}));

vi.mock("next/navigation", () => ({
    usePathname: () => demoLocation.pathname,
    useSearchParams: () => demoLocation.params,
}));

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children?: ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));

vi.mock("@/features/meetings/runtime/replay-run", () => ({
    useReplayRun: () => replayRun,
}));

const chapter: ReplayChapter = {
    chapter_id: "chapter-facts",
    title: "Established facts",
    objective: "Inspect the recorded evidence",
    checkpoint: "checkpoint-credit",
    route: "meeting",
    tab: "documents",
    mode: "inspection",
    disclosure: "Recorded evidence only.",
    summary_message_id: null,
    claim_ids: [],
    input_asset_ids: [],
};

function renderChapter() {
    return render(
        <ChapterBootstrap>
            <p>Chapter content</p>
        </ChapterBootstrap>
    );
}

describe("ChapterBootstrap", () => {
    beforeEach(() => {
        demoLocation.pathname = "/demo/meetings/meeting-1";
        demoLocation.params = new URLSearchParams("");
        replayRun.checkpoint = "checkpoint-initial";
        replayRun.goToChapter.mockReset();
        replayRun.goToChapter.mockResolvedValue(undefined);
        replayRun.session.retired = false;
        replayRun.session.chapters = [chapter];
    });

    it("installs the approved chapter checkpoint before opening the room", async () => {
        demoLocation.params = new URLSearchParams(
            "chapter=chapter-facts&tab=documents"
        );
        renderChapter();

        expect(screen.getByText("Restoring recorded chapter")).toBeInTheDocument();
        await waitFor(() =>
            expect(replayRun.goToChapter).toHaveBeenCalledWith("chapter-facts", {
                signal: expect.any(AbortSignal),
            })
        );

        replayRun.checkpoint = "checkpoint-credit";
        expect(await screen.findByText("Chapter content")).toBeInTheDocument();
    });

    it("renders immediately when the chapter is already installed", () => {
        demoLocation.params = new URLSearchParams(
            "chapter=chapter-facts&tab=documents"
        );
        replayRun.checkpoint = "checkpoint-credit";
        renderChapter();

        expect(screen.getByText("Chapter content")).toBeInTheDocument();
        expect(replayRun.goToChapter).not.toHaveBeenCalled();
    });

    it("rejects a tab that widens the approved chapter", () => {
        demoLocation.params = new URLSearchParams(
            "chapter=chapter-facts&tab=summary"
        );
        renderChapter();

        expect(screen.getByText("Recorded chapter unavailable")).toBeInTheDocument();
        expect(
            screen.getByText(
                "This chapter is not available at the requested route or tab."
            )
        ).toBeInTheDocument();
        expect(screen.getByText("Open the recorded board")).toBeInTheDocument();
        expect(replayRun.goToChapter).not.toHaveBeenCalled();
    });

    it("rejects an unknown chapter without guessing a checkpoint", () => {
        demoLocation.params = new URLSearchParams("chapter=chapter-missing");
        renderChapter();

        expect(screen.getByText("Recorded chapter unavailable")).toBeInTheDocument();
        expect(
            screen.getByText("That chapter is not part of the pinned recording.")
        ).toBeInTheDocument();
        expect(replayRun.goToChapter).not.toHaveBeenCalled();
    });

    it("rejects a chapter requested at the wrong route", () => {
        demoLocation.pathname = "/demo";
        demoLocation.params = new URLSearchParams(
            "chapter=chapter-facts&tab=documents"
        );
        renderChapter();

        expect(screen.getByText("Recorded chapter unavailable")).toBeInTheDocument();
        expect(
            screen.getByText(
                "This chapter is not available at the requested route or tab."
            )
        ).toBeInTheDocument();
    });

    it("rejects every chapter from a retired package", () => {
        demoLocation.params = new URLSearchParams(
            "chapter=chapter-facts&tab=documents"
        );
        replayRun.session.retired = true;
        renderChapter();

        expect(screen.getByText("Recorded chapter unavailable")).toBeInTheDocument();
        expect(
            screen.getByText(/This recorded package has been retired/)
        ).toBeInTheDocument();
    });
});
