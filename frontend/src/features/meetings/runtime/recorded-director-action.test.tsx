import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("RecordedDirectorAction", () => {
    it("offers the recorded follow-up without any tutorial provider", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(runtime());

        render(<RecordedDirectorAction />);

        expect(
            screen.getByRole("button", { name: /Send the supported follow-up/ })
        ).toBeInTheDocument();
    });

    it("hides a follow-up that has already settled", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(
            runtime({ settled: ["director-follow-up"] })
        );

        const { container } = render(<RecordedDirectorAction />);

        expect(container).toBeEmptyDOMElement();
    });

    it("keeps a non-canonical exploration follow-up available", () => {
        vi.mocked(useMeetingsRuntime).mockReturnValue(
            runtime({ canonical: false })
        );

        render(<RecordedDirectorAction />);

        expect(
            screen.getByRole("button", { name: /Send the supported follow-up/ })
        ).toBeInTheDocument();
    });

    it("previews the exact prepared question behind a disclosure", async () => {
        const question =
            "Portfolio Analyst, assume a fictional three-year mandate that requires an executable price, yield, and liquidity assessment. What can you conclude from this record?";
        const sendFollowUp = vi.fn().mockResolvedValue(undefined);
        vi.mocked(useMeetingsRuntime).mockReturnValue({
            replay: {
                transitions: [],
                checkpoint: "checkpoint-base",
                preparedBaseCheckpoint: "checkpoint-base",
                preparedTurns: [
                    {
                        kind: "follow_up",
                        turn_id: "prepared-follow-up",
                        label: "Send the follow-up",
                        question,
                        message_id: "message-follow-up",
                        intent_id: null,
                        participant_id: null,
                        required: true,
                    },
                ],
                playedTurnIds: new Set<string>(),
                sendFollowUp,
                legalActions: () => [],
            },
        } as unknown as MeetingsRuntime);

        render(<RecordedDirectorAction />);

        const preview = screen.getByText(question);
        expect(preview).toHaveClass("line-clamp-2");

        const expand = screen.getByRole("button", { name: "Expand" });
        expect(expand).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(expand);

        expect(screen.getByRole("button", { name: "Collapse" })).toHaveAttribute(
            "aria-expanded",
            "true"
        );
        expect(preview).toHaveTextContent(question);
        expect(preview).not.toHaveClass("line-clamp-2");

        fireEvent.click(screen.getByRole("button", { name: "Send question" }));
        await waitFor(() => expect(sendFollowUp).toHaveBeenCalledTimes(1));
    });
});
