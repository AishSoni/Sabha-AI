import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
    GuideActionsProvider,
    type GuideActions,
} from "../guide/guide-actions";
import type {
    MeetingsRuntime,
    ParticipantActionProps,
} from "./contract";
import { useMeetingsRuntime } from "./context";
import { RecordedParticipantAction } from "./recorded-participant-action";

vi.mock("./context", () => ({ useMeetingsRuntime: vi.fn() }));

const participant = {
    id: "participant-credit",
    name: "Credit Analyst",
} as ParticipantActionProps["participant"];

const creditIntent = {
    intent_id: "credit-analyst",
    kind: "start_participant",
    checkpoint: "checkpoint-created",
    label: "Ask the Credit Analyst",
    participant_id: "participant-credit",
};

function creditTransition(canonical = true) {
    return {
        transition_id: "legacy-credit",
        source_checkpoint: "checkpoint-created",
        completed_checkpoint: "checkpoint-created",
        intent_id: "credit-analyst",
        kind: "start_participant",
        participant_id: "participant-credit",
        operation_id: "operation-credit",
        tape_id: "tape-credit",
        closing_tape_id: null,
        canonical,
        prerequisites: [],
        label: "Ask the Credit Analyst",
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
            checkpoint: "checkpoint-created",
            settledIntents: new Set(settled),
            legalActions: () => [
                {
                    transition: creditTransition(canonical),
                    intent: creditIntent,
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
            <RecordedParticipantAction
                participant={participant}
                isActive={false}
                isQueued={false}
                disabled={false}
                onStart={vi.fn()}
            />
        </GuideActionsProvider>
    );
}

describe("RecordedParticipantAction", () => {
    it("offers the active guided turn", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(runtime());

        renderAction("credit-analyst");

        expect(
            screen.getByRole("button", { name: /Ask the Credit Analyst/ })
        ).toBeInTheDocument();
    });

    it("hides a canonical turn when no guided step is active", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(runtime());

        const { container } = renderAction(null);

        expect(container).toBeEmptyDOMElement();
    });

    it("hides a later canonical turn while an earlier step is active", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(runtime());

        const { container } = renderAction("portfolio-analyst");

        expect(container).toBeEmptyDOMElement();
    });

    it("hides a prepared turn once it has settled", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(
            runtime({ settled: ["credit-analyst"] })
        );

        const { container } = renderAction("credit-analyst");

        expect(container).toBeEmptyDOMElement();
    });

    it("keeps a non-canonical exploration turn available", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(
            runtime({ canonical: false })
        );

        renderAction(null);

        expect(
            screen.getByRole("button", { name: /Ask the Credit Analyst/ })
        ).toBeInTheDocument();
    });

    it("keeps standalone legacy behavior outside the guide", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(runtime());

        render(
            <RecordedParticipantAction
                participant={participant}
                isActive={false}
                isQueued={false}
                disabled={false}
                onStart={vi.fn()}
            />
        );

        expect(
            screen.getByRole("button", { name: /Ask the Credit Analyst/ })
        ).toBeInTheDocument();
    });
});
