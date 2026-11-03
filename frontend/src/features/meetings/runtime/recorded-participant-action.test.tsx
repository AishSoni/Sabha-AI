import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
        explanation: "",
        label: "Ask the Credit Analyst",
    };
}

function runtime(
    options: { settled?: string[]; canonical?: boolean } = {}
): MeetingsRuntime {
    const { settled = [], canonical = true } = options;
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

function renderAction() {
    return render(
        <RecordedParticipantAction
            participant={participant}
            isActive={false}
            isQueued={false}
            disabled={false}
            onStart={vi.fn()}
        />
    );
}

describe("RecordedParticipantAction", () => {
    it("offers the recorded turn without any tutorial provider", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(runtime());

        renderAction();

        expect(
            screen.getByRole("button", { name: /Ask the Credit Analyst/ })
        ).toBeInTheDocument();
    });

    it("hides a prepared turn once it has settled", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(
            runtime({ settled: ["credit-analyst"] })
        );

        const { container } = renderAction();

        expect(container).toBeEmptyDOMElement();
    });

    it("keeps every settled-out action hidden regardless of order", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(
            runtime({ settled: ["credit-analyst"] })
        );

        renderAction();

        expect(
            screen.queryByRole("button", { name: /Ask the Credit Analyst/ })
        ).toBeNull();
    });

    it("keeps a non-canonical exploration turn available", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(
            runtime({ canonical: false })
        );

        renderAction();

        expect(
            screen.getByRole("button", { name: /Ask the Credit Analyst/ })
        ).toBeInTheDocument();
    });
});
