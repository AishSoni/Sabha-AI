import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
    MeetingsRuntime,
    ParticipantActionProps,
    ReplayPreparedTurn,
} from "./contract";
import { useMeetingsRuntime } from "./context";
import { deriveProgression } from "./progression";
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

const mira = {
    id: "mira",
    name: "Mira",
    role: "Credit Analyst",
    color: "#6366f1",
} as ParticipantActionProps["participant"];

function preparedReply(
    turnId: string,
    label: string
): ReplayPreparedTurn {
    return {
        kind: "reply",
        turn_id: turnId,
        participant_id: "mira",
        label,
        intent_id: turnId,
        operation_id: `operation-${turnId}`,
        tape_id: `tape-${turnId}`,
        result_checkpoint: `checkpoint-${turnId}`,
        reply_message_ids: [],
        effect_ids: [],
        required: true,
    };
}

function deckRuntime(
    turns: ReplayPreparedTurn[],
    accepted: string[]
): MeetingsRuntime {
    const requiredTurnIds = turns.map((turn) => turn.turn_id);
    return {
        replay: {
            checkpoint: "checkpoint-prepared-base",
            preparedBaseCheckpoint: "checkpoint-prepared-base",
            preparedTurns: turns,
            playedTurnIds: new Set(accepted),
            activePreparedOperationId: null,
            progression: deriveProgression({
                turns,
                requiredTurnIds,
                acceptedTurnIds: new Set(accepted),
            }),
            startPreparedTurn: vi.fn(),
            legalActions: () => [],
            settledIntents: new Set(),
        },
    } as unknown as MeetingsRuntime;
}

function renderMira() {
    return render(
        <RecordedParticipantAction
            participant={mira}
            isActive={false}
            isQueued={false}
            disabled={false}
            onStart={vi.fn()}
        />
    );
}

describe("RecordedParticipantAction prepared identity", () => {
    it("chooses an opening view by mark, friendly name, and role", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(
            deckRuntime(
                [preparedReply("prepared-credit", "Credit Analyst opening facts")],
                []
            )
        );

        renderMira();

        expect(
            screen.getByRole("button", {
                name: /Ask Mira, Credit Analyst for an opening view/,
            })
        ).toBeInTheDocument();
        expect(screen.queryByText(/opening facts/)).toBeNull();
    });

    it("reveals the authored title only after the later turn unlocks", () => {
        const turns = [
            preparedReply("prepared-credit", "Credit Analyst opening facts"),
            preparedReply("prepared-consensus", "Committee alignment"),
        ];
        vi.mocked(useMeetingsRuntime).mockReturnValue(
            deckRuntime(turns, ["prepared-credit"])
        );

        renderMira();

        expect(
            screen.getByRole("button", {
                name: /Committee alignment — Mira, Credit Analyst/,
            })
        ).toBeInTheDocument();
    });

    it("does not render a locked later turn", () => {
        const turns = [
            preparedReply("prepared-credit", "Credit Analyst opening facts"),
            preparedReply("prepared-consensus", "Committee alignment"),
        ];
        vi.mocked(useMeetingsRuntime).mockReturnValue(deckRuntime(turns, []));

        renderMira();

        expect(
            screen.queryByRole("button", { name: /Committee alignment/ })
        ).toBeNull();
    });
});
