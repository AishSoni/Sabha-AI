import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { ReplayRunProvider, useReplayRun } from "./replay-run";

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
            <ReplayRunProvider>{children}</ReplayRunProvider>
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
