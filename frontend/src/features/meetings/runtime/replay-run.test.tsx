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

function stubReplayReads(session: unknown) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: unknown) => {
            const url = String(input);
            if (url.endsWith("/replay/session")) return json(session);
            if (url.includes("/workspace-seed")) {
                return json({ detail: "replay_workspace_seed_unavailable" }, 404);
            }
            if (url.includes("/safe-config")) return json({});
            if (url.includes("/disagreements")) return json([]);
            if (url.includes("/consensus")) return json([]);
            if (url.endsWith("/turns") || url.includes("/turns?")) {
                return json([completedOperationWire()]);
            }
            if (url.includes(`/replay/meetings/${MEETING_ID}?`)) {
                return json(completedMeetingWire());
            }
            return json({ detail: "replay_read_unavailable" }, 404);
        })
    );
}

function renderReplayRun() {
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
    return renderHook(() => useReplayRun(), { wrapper });
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

        let transition: Promise<unknown> | undefined;
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

    it("does not settle a skipped action whose bundle resolves after a reset", async () => {
        let meetingCalls = 0;
        let resolveSecondMeeting: ((value: Response) => void) | undefined;
        const secondMeeting = new Promise<Response>((resolve) => {
            resolveSecondMeeting = resolve;
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: unknown) => {
                const url = String(input);
                if (url.endsWith("/replay/session")) {
                    return json(expandedSessionWire());
                }
                if (url.includes("/workspace-seed")) {
                    return json({ detail: "replay_workspace_seed_unavailable" }, 404);
                }
                if (url.includes("/safe-config")) return json({});
                if (url.includes("/disagreements")) return json([]);
                if (url.includes("/consensus")) return json([]);
                if (url.endsWith("/turns") || url.includes("/turns?")) {
                    return json([completedOperationWire()]);
                }
                if (url.includes(`/replay/meetings/${MEETING_ID}?`)) {
                    meetingCalls += 1;
                    if (meetingCalls === 1) return json(completedMeetingWire());
                    return secondMeeting;
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
        let skipped: Promise<void> | undefined;
        act(() => {
            skipped = result.current.skipIntent("credit");
        });
        act(() => {
            result.current.restart();
        });
        resolveSecondMeeting?.(json(completedMeetingWire()) as Response);
        await act(async () => {
            await skipped;
        });

        expect(result.current.checkpoint).toBe("checkpoint-initial");
        expect(result.current.settledIntents.has("credit")).toBe(false);
        expect(result.current.startedIntents.has("credit")).toBe(false);
    });
});

function expandedSessionWire() {
    return {
        ...sessionWire(),
        intents: [
            {
                intent_id: "create",
                kind: "create_meeting",
                checkpoint: "checkpoint-initial",
                participant_id: null,
                operation_id: null,
                tape_id: null,
                closing_tape_id: null,
                label: "Create the meeting",
            },
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
                transition_id: "canonical-create",
                source_checkpoint: "checkpoint-initial",
                completed_checkpoint: "checkpoint-created",
                intent_id: "create",
                kind: "create_meeting",
                participant_id: null,
                operation_id: null,
                tape_id: null,
                closing_tape_id: null,
                canonical: true,
                prerequisites: [],
                label: "Create the meeting",
                explanation: "",
            },
            {
                transition_id: "canonical-credit",
                source_checkpoint: "checkpoint-created",
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

function closingSessionWire(canonical = true) {
    const base = expandedSessionWire();
    return {
        ...base,
        checkpoints: [...base.checkpoints, "checkpoint-closed"],
        intents: [
            ...base.intents,
            {
                intent_id: "close",
                kind: "request_closing",
                checkpoint: "checkpoint-created",
                participant_id: null,
                operation_id: null,
                tape_id: null,
                closing_tape_id: null,
                label: "Close the meeting",
            },
        ],
        transitions: [
            ...base.transitions,
            {
                transition_id: "canonical-close",
                source_checkpoint: "checkpoint-created",
                completed_checkpoint: "checkpoint-closed",
                intent_id: "close",
                kind: "request_closing",
                participant_id: null,
                operation_id: null,
                tape_id: null,
                closing_tape_id: null,
                canonical,
                prerequisites: [],
                label: "Close the meeting",
                explanation: "",
            },
        ],
    };
}

function legacySessionWire() {
    return {
        ...sessionWire(),
        intents: [
            {
                intent_id: "create",
                kind: "create_meeting",
                checkpoint: "checkpoint-created",
                participant_id: null,
                operation_id: null,
                tape_id: null,
                closing_tape_id: null,
                label: "Create the meeting",
            },
        ],
        transitions: [],
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
            await result.current.switchCheckpoint("checkpoint-created");
        });
        await act(async () => {
            await result.current.skipIntent("credit");
        });
        expect(result.current.checkpoint).toBe("checkpoint-created");
        expect(result.current.settledIntents.has("credit")).toBe(true);

        await act(async () => {
            await result.current.replayIntent("credit");
        });
        expect(result.current.checkpoint).toBe("checkpoint-created");
        expect(result.current.startedIntents.has("credit")).toBe(true);
        expect(result.current.settledIntents.has("credit")).toBe(true);
    });

    it("installs the completed snapshot for a creation intent without a tape", async () => {
        const calls: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: unknown) => {
                const url = String(input);
                calls.push(url);
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
            await result.current.startIntent("create");
        });

        expect(result.current.checkpoint).toBe("checkpoint-created");
        expect(result.current.settledIntents.has("create")).toBe(true);
        expect(
            calls.some((url) =>
                url.includes("checkpoint=checkpoint-created")
            )
        ).toBe(true);
    });

    it("settles a non-tape intent from a legacy package without transitions", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: unknown) => {
                const url = String(input);
                if (url.endsWith("/replay/session")) return json(legacySessionWire());
                if (url.includes("/workspace-seed")) {
                    return json({ detail: "replay_workspace_seed_unavailable" }, 404);
                }
                if (url.includes("/safe-config")) return json({});
                if (url.includes("/disagreements")) return json([]);
                if (url.includes("/consensus")) return json([]);
                if (url.includes("/turns")) return json([]);
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
            await result.current.startIntent("create");
        });

        expect(result.current.checkpoint).toBe("checkpoint-created");
        expect(result.current.settledIntents.has("create")).toBe(true);
    });

    it("completes the canonical closing when the close action is started", async () => {
        stubReplayReads(closingSessionWire());

        const { result } = renderReplayRun();
        await waitFor(() => expect(result.current.session).not.toBeNull());

        await act(async () => {
            await result.current.switchCheckpoint("checkpoint-created");
        });
        await act(async () => {
            await result.current.startIntent("close");
        });
        expect(result.current.checkpoint).toBe("checkpoint-closed");
        expect(result.current.settledIntents.has("close")).toBe(true);
        expect(result.current.closingCompleted).toBe(true);

        await act(async () => {
            await result.current.skipIntent("close");
        });
        expect(result.current.closingCompleted).toBe(true);

        await act(async () => {
            result.current.restart();
        });
        expect(result.current.closingCompleted).toBe(false);
    });

    it("completes the canonical closing when the ended snapshot is installed", async () => {
        stubReplayReads(closingSessionWire());

        const { result } = renderReplayRun();
        await waitFor(() => expect(result.current.session).not.toBeNull());

        await act(async () => {
            await result.current.switchCheckpoint("checkpoint-closed");
        });

        expect(result.current.checkpoint).toBe("checkpoint-closed");
        expect(result.current.settledIntents.has("close")).toBe(true);
        expect(result.current.closingCompleted).toBe(true);
    });

    it("does not complete the canonical closing for an exploration-only close", async () => {
        stubReplayReads(closingSessionWire(false));

        const { result } = renderReplayRun();
        await waitFor(() => expect(result.current.session).not.toBeNull());

        await act(async () => {
            await result.current.switchCheckpoint("checkpoint-created");
        });
        await act(async () => {
            await result.current.startIntent("close");
        });

        expect(result.current.settledIntents.has("close")).toBe(true);
        expect(result.current.closingCompleted).toBe(false);
    });
});
