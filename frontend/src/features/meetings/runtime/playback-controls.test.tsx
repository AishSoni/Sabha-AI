import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MeetingsRuntime, ReplayTransition } from "./contract";
import { MeetingsRuntimeProvider } from "./context";
import { PreparedTurnControls, ReplaySpeedControl } from "./playback-controls";

function transition(overrides: Partial<ReplayTransition> = {}): ReplayTransition {
    return {
        transition_id: "canonical-credit",
        source_checkpoint: "checkpoint-initial",
        completed_checkpoint: "checkpoint-created",
        intent_id: "credit",
        kind: "start_participant",
        participant_id: "participant-1",
        operation_id: "operation-1",
        tape_id: "tape-1",
        closing_tape_id: null,
        canonical: true,
        prerequisites: [],
        label: "Ask the Credit Analyst",
        explanation: "",
        ...overrides,
    };
}

function runtime(
    checkpoint: string,
    transitions: ReplayTransition[]
): MeetingsRuntime {
    return {
        replay: {
            checkpoint,
            transitions,
            setPlaybackSpeed: vi.fn(),
            skipIntent: vi.fn(async () => {}),
            replayIntent: vi.fn(async () => {}),
        },
    } as unknown as MeetingsRuntime;
}

function renderControls(
    value: MeetingsRuntime,
    activeOperationId?: string | null
) {
    return render(
        <MeetingsRuntimeProvider runtime={value}>
            <PreparedTurnControls activeOperationId={activeOperationId} />
            <ReplaySpeedControl />
        </MeetingsRuntimeProvider>
    );
}

describe("prepared playback controls", () => {
    it("skips and replays the active prepared turn by intent identity", async () => {
        const value = runtime("checkpoint-initial", [transition()]);
        renderControls(value, "operation-1");

        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: "Skip to prepared result" })
            );
        });
        await waitFor(() =>
            expect(value.replay?.skipIntent).toHaveBeenCalledWith("credit")
        );

        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: "Replay this prepared turn" })
            );
        });
        await waitFor(() =>
            expect(value.replay?.replayIntent).toHaveBeenCalledWith("credit")
        );
    });

    it("replays a settled turn from its completed state without offering skip", async () => {
        const value = runtime("checkpoint-created", [transition()]);
        renderControls(value, null);

        expect(
            screen.queryByRole("button", { name: "Skip to prepared result" })
        ).not.toBeInTheDocument();
        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: "Replay this prepared turn" })
            );
        });
        await waitFor(() =>
            expect(value.replay?.replayIntent).toHaveBeenCalledWith("credit")
        );
    });

    it("changes the bounded playback speed", () => {
        const value = runtime("checkpoint-initial", [transition()]);
        renderControls(value, "operation-1");

        fireEvent.click(screen.getByRole("button", { name: "2x" }));
        expect(value.replay?.setPlaybackSpeed).toHaveBeenCalledWith(2);
    });
});
