import { describe, expect, it } from "vitest";
import { decodeReplaySession } from "./replay";

function sessionPayload(): Record<string, unknown> {
    return {
        run_id: "run-1",
        package_version: "1",
        meeting_id: "meeting-1",
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
            contextStats: true,
            createMeeting: false,
            sendMessage: false,
            submitTurn: false,
            cancelTurn: false,
            summary: false,
            documents: true,
            closing: true,
        },
        package_id: "placeholder-analyst",
        content_sha256: "a".repeat(64),
        checkpoint_id: "checkpoint-initial",
        initial_checkpoint: "checkpoint-initial",
        checkpoints: ["checkpoint-initial"],
        intents: [],
        beats: [],
        tapes: [],
        assets: [],
        claims: [
            {
                claim_id: "C1",
                kind: "fact",
                text: "Coupon is 7.87%.",
                evidence_asset_id: "crisil-annexure",
                locator: "S1 annexure row",
                excerpt: "7.87%",
                source_url: "https://example.com/crisil",
                source_title: "CRISIL rationale",
                capture_date: "2026-10-16",
            },
        ],
        preview: { available: true, asset_ids: ["crisil-annexure"] },
        retired: false,
    };
}

describe("decodeReplaySession evidence fields", () => {
    it("decodes validated claims and preview availability", () => {
        const session = decodeReplaySession(sessionPayload());

        expect(session.claims).toEqual([
            {
                claim_id: "C1",
                kind: "fact",
                text: "Coupon is 7.87%.",
                evidence_asset_id: "crisil-annexure",
                locator: "S1 annexure row",
                excerpt: "7.87%",
                source_url: "https://example.com/crisil",
                source_title: "CRISIL rationale",
                capture_date: "2026-10-16",
            },
        ]);
        expect(session.preview).toEqual({
            available: true,
            asset_ids: ["crisil-annexure"],
        });
    });

    it("rejects a session without preview availability", () => {
        const payload = sessionPayload();
        delete payload.preview;

        expect(() => decodeReplaySession(payload)).toThrow();
    });

    it("rejects a claim without its stable identity", () => {
        const payload = sessionPayload();
        payload.claims = [
            {
                kind: "fact",
                text: "Coupon is 7.87%.",
                evidence_asset_id: "crisil-annexure",
                locator: "S1 annexure row",
                excerpt: "7.87%",
                source_url: "https://example.com/crisil",
                source_title: "CRISIL rationale",
                capture_date: "2026-10-16",
            },
        ];

        expect(() => decodeReplaySession(payload)).toThrow();
    });
});
