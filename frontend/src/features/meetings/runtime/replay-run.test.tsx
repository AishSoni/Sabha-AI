import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { ReplayRunProvider, useReplayRun } from "./replay-run";
import { ReplaySessionProvider } from "./replay-session";
import { DemoWorkspaceProvider } from "@/features/demo-workspace";

const MEETING_ID = "11111111-1111-4111-8111-111111111111";

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function sessionWire() {
    return {
        run_id: "run-1",
        package_version: "1",
        meeting_id: MEETING_ID,
        label: "Recorded session",
        title: "Recorded credit review",
        as_of: "2026-01-15",
        disclosure: "",
        stack_labels: {},
        provenance: {},
        capabilities: {
            meetingRead: true,
            turnObservation: true,
            disagreements: true,
            consensus: true,
            contextStats: false,
            createMeeting: false,
            sendMessage: false,
            submitTurn: false,
            cancelTurn: false,
            summary: false,
            documents: false,
            closing: false,
        },
        package_id: "placeholder-analyst",
        content_sha256: "a".repeat(64),
        checkpoint_id: "checkpoint-initial",
        initial_checkpoint: "checkpoint-initial",
        checkpoints: ["checkpoint-initial", "checkpoint-created"],
        intents: [],
        beats: [],
        tapes: [],
        assets: [],
        claims: [],
        preview: { available: false, asset_ids: [] },
        retired: false,
    };
}

function meetingWire() {
    return {
        id: MEETING_ID,
        name: "Recorded board",
        agenda: "Recorded agenda",
        status: "active",
        total_cost: 0,
        created_at: "2026-01-15T10:00:00Z",
        participants: [],
        messages: [],
    };
}

describe("ReplayRunProvider checkpoint transitions", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("does not request a meeting bundle when rewinding to the initial checkpoint", async () => {
        const calls: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: unknown) => {
                const url = String(input);
                calls.push(url);
                if (url.endsWith("/replay/session")) return json(sessionWire());
                if (url.includes("/workspace-seed")) {
                    return json({ detail: "replay_workspace_seed_unavailable" }, 404);
                }
                if (url.includes("/safe-config")) return json({});
                if (url.includes("/disagreements")) return json([]);
                if (url.includes("/consensus")) return json([]);
                if (url.endsWith("/turns") || url.includes("/turns?")) return json([]);
                if (url.includes(`/replay/meetings/${MEETING_ID}?`)) {
                    return json(meetingWire());
                }
                return json({ detail: "replay_read_unavailable" }, 404);
            })
        );

        const wrapper = ({ children }: { children: ReactNode }) => (
            <ReplaySessionProvider>
                <DemoWorkspaceProvider
                    identity={{
                        packageId: "placeholder-analyst",
                        version: "1",
                        contentSha256: "a".repeat(64),
                        meetingId: MEETING_ID,
                    }}
                >
                    <ReplayRunProvider>{children}</ReplayRunProvider>
                </DemoWorkspaceProvider>
            </ReplaySessionProvider>
        );
        const { result } = renderHook(() => useReplayRun(), { wrapper });

        await waitFor(() => expect(result.current.session).not.toBeNull());

        await act(async () => {
            await result.current.switchCheckpoint("checkpoint-created");
        });
        expect(result.current.checkpoint).toBe("checkpoint-created");

        const initialReadsBefore = calls.filter((url) =>
            url.includes("checkpoint=checkpoint-initial")
        ).length;

        await act(async () => {
            await result.current.switchCheckpoint("checkpoint-initial");
        });

        expect(result.current.checkpoint).toBe("checkpoint-initial");
        expect(
            calls.filter((url) => url.includes("checkpoint=checkpoint-initial"))
        ).toHaveLength(initialReadsBefore);
        expect(
            calls.some(
                (url) =>
                    url.includes("checkpoint=checkpoint-initial") &&
                    (url.includes("/disagreements") ||
                        url.includes("/consensus") ||
                        url.includes("/turns"))
            )
        ).toBe(false);
    });
});

describe("ReplayRunProvider reset fencing", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("discards a checkpoint bundle that resolves after a reset", async () => {
        let resolveMeeting: ((value: Response) => void) | undefined;
        const pendingMeeting = new Promise<Response>((resolve) => {
            resolveMeeting = resolve;
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: unknown) => {
                const url = String(input);
                if (url.endsWith("/replay/session")) return json(sessionWire());
                if (url.includes("/workspace-seed")) {
                    return json({ detail: "replay_workspace_seed_unavailable" }, 404);
                }
                if (url.includes("/safe-config")) return json({});
                if (url.includes("/disagreements")) return json([]);
                if (url.includes("/consensus")) return json([]);
                if (url.endsWith("/turns") || url.includes("/turns?")) return json([]);
                if (url.includes(`/replay/meetings/${MEETING_ID}?`)) {
                    return pendingMeeting;
                }
                return json({ detail: "replay_read_unavailable" }, 404);
            })
        );

        const wrapper = ({ children }: { children: ReactNode }) => (
            <ReplaySessionProvider>
                <DemoWorkspaceProvider
                    identity={{
                        packageId: "placeholder-analyst",
                        version: "1",
                        contentSha256: "a".repeat(64),
                        meetingId: MEETING_ID,
                    }}
                >
                    <ReplayRunProvider>{children}</ReplayRunProvider>
                </DemoWorkspaceProvider>
            </ReplaySessionProvider>
        );
        const { result } = renderHook(() => useReplayRun(), { wrapper });
        await waitFor(() => expect(result.current.session).toBeDefined());

        let transition: Promise<void> | undefined;
        act(() => {
            transition = result.current.switchCheckpoint("checkpoint-created");
        });
        act(() => {
            result.current.restart();
        });
        resolveMeeting?.(json(meetingWire()) as Response);
        await act(async () => {
            await transition;
        });

        expect(result.current.checkpoint).toBe("checkpoint-initial");
    });
});

function expandedSessionWire() {
    return {
        ...sessionWire(),
        intents: [
            {
                intent_id: "credit",
                kind: "start_participant",
                checkpoint: "checkpoint-created",
                participant_id: "participant-1",
                operation_id: "operation-1",
                tape_id: "tape-1",
                closing_tape_id: null,
                label: "Ask the Credit Analyst",
            },
        ],
        tapes: [
            {
                tape_id: "tape-1",
                operation_id: "operation-1",
                participant_id: "participant-1",
                initial_checkpoint: "checkpoint-initial",
                completed_checkpoint: "checkpoint-created",
            },
        ],
        transitions: [
            {
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
            },
        ],
    };
}

function completedMeetingWire() {
    return {
        ...meetingWire(),
        messages: [
            {
                id: "message-1",
                meeting_id: MEETING_ID,
                sender_type: "ai",
                sender_id: "participant-1",
                sender_name: "The Credit Analyst",
                content: "Recorded credit answer",
                citations: [],
                tool_artifacts: null,
                thinking_content: null,
                estimated_cost: 0,
                created_at: "2026-01-15T10:00:20Z",
            },
        ],
    };
}

function completedOperationWire() {
    return {
        operation_id: "operation-1",
        meeting_id: MEETING_ID,
        participant_id: "participant-1",
        request_key: "turn-1",
        status: "completed",
        admission: 1,
        queue_position: null,
        created_at: "2026-01-15T10:00:05Z",
        started_at: "2026-01-15T10:00:05Z",
        completed_at: "2026-01-15T10:00:20Z",
        final_message_id: "message-1",
        cancel_requested: false,
        error: null,
        effective_generation: null,
    };
}

describe("ReplayRunProvider prepared playback", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("skips to the completed turn and replays from the approved source state", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: unknown) => {
                const url = String(input);
                if (url.endsWith("/replay/session")) return json(expandedSessionWire());
                if (url.includes("/workspace-seed")) {
                    return json({ detail: "replay_workspace_seed_unavailable" }, 404);
                }
                if (url.includes("/safe-config")) return json({});
                if (url.includes("/disagreements")) return json([]);
                if (url.includes("/consensus")) return json([]);
                if (url.includes("/turns")) return json([completedOperationWire()]);
                if (url.includes(`/replay/meetings/${MEETING_ID}?`)) {
                    return json(completedMeetingWire());
                }
                return json({ detail: "replay_read_unavailable" }, 404);
            })
        );

        const wrapper = ({ children }: { children: ReactNode }) => (
            <ReplaySessionProvider>
                <DemoWorkspaceProvider
                    identity={{
                        packageId: "placeholder-analyst",
                        version: "1",
                        contentSha256: "a".repeat(64),
                        meetingId: MEETING_ID,
                    }}
                >
                    <ReplayRunProvider>{children}</ReplayRunProvider>
                </DemoWorkspaceProvider>
            </ReplaySessionProvider>
        );
        const { result } = renderHook(() => useReplayRun(), { wrapper });
        await waitFor(() => expect(result.current.session).not.toBeNull());

        await act(async () => {
            await result.current.skipIntent("credit");
        });
        expect(result.current.checkpoint).toBe("checkpoint-created");
        expect(result.current.settledIntents.has("credit")).toBe(true);

        await act(async () => {
            await result.current.replayIntent("credit");
        });
        expect(result.current.checkpoint).toBe("checkpoint-initial");
        expect(result.current.startedIntents.has("credit")).toBe(true);
        expect(result.current.settledIntents.has("credit")).toBe(true);

        act(() => {
            result.current.setPlaybackSpeed(2);
        });
        expect(result.current.playbackSpeed).toBe(2);
    });
});
