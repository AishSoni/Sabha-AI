import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
    GuideActionsProvider,
    type GuideActions,
} from "../guide/guide-actions";
import type { MeetingsRuntime } from "./contract";
import { useMeetingsRuntime } from "./context";
import { RecordedDirectorAction } from "./recorded-director-action";

vi.mock("./context", () => ({ useMeetingsRuntime: vi.fn() }));

const followUpIntent = {
    intent_id: "director-follow-up",
    kind: "director_follow_up",
    checkpoint: "checkpoint-followup",
    label: "Send the supported follow-up",
};

function followUpTransition(canonical = true) {
    return {
        transition_id: "legacy-follow-up",
        source_checkpoint: "checkpoint-downside",
        completed_checkpoint: "checkpoint-followup",
        intent_id: "director-follow-up",
        kind: "director_follow_up",
        participant_id: "participant-portfolio",
        operation_id: null,
        tape_id: null,
        closing_tape_id: null,
        canonical,
        prerequisites: [],
        label: "Send the supported follow-up",
        explanation: "",
    };
}

function runtime({
    settled = [],
    canonical = true,
}: {
    settled?: string[];
    canonical?: boolean;
} = {}): MeetingsRuntime {
    return {
        replay: {
            transitions: [],
            checkpoint: "checkpoint-downside",
            settledIntents: new Set(settled),
            legalActions: () => [
                {
                    transition: followUpTransition(canonical),
                    intent: followUpIntent,
                    available: true,
                    reason: null,
                },
            ],
            startIntent: vi.fn(),
        },
    } as unknown as MeetingsRuntime;
}

function guide(activeIntentId: string | null): GuideActions {
    return {
        review: null,
        activeIntentId,
        currentHref: "/demo/meetings/demo-meeting",
        nextHref: null,
        nextTab: null,
        advance: vi.fn(),
    };
}

function renderAction(activeIntentId: string | null) {
    return render(
        <GuideActionsProvider value={guide(activeIntentId)}>
            <RecordedDirectorAction />
        </GuideActionsProvider>
    );
}

describe("RecordedDirectorAction", () => {
    it("offers the active director follow-up", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(runtime());

        renderAction("director-follow-up");

        expect(
            screen.getByRole("button", { name: /Send the supported follow-up/ })
        ).toBeInTheDocument();
    });

    it("hides the follow-up when no guided step is active", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(runtime());

        const { container } = renderAction(null);

        expect(container).toBeEmptyDOMElement();
    });

    it("hides a later canonical follow-up while an earlier step is active", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(runtime());

        const { container } = renderAction("portfolio-analyst");

        expect(container).toBeEmptyDOMElement();
    });

    it("hides a follow-up that has already settled", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(
            runtime({ settled: ["director-follow-up"] })
        );

        const { container } = renderAction("director-follow-up");

        expect(container).toBeEmptyDOMElement();
    });

    it("keeps a non-canonical exploration follow-up available", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(
            runtime({ canonical: false })
        );

        renderAction(null);

        expect(
            screen.getByRole("button", { name: /Send the supported follow-up/ })
        ).toBeInTheDocument();
    });

    it("keeps standalone legacy behavior outside the guide", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(runtime());

        render(<RecordedDirectorAction />);

        expect(
            screen.getByRole("button", { name: /Send the supported follow-up/ })
        ).toBeInTheDocument();
    });
});
