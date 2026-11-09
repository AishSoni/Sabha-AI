import { describe, expect, it } from "vitest";
import {
    decodeWorkspaceSeed,
    localStateFromSeed,
} from "@/features/demo-workspace";
import { demoWorkspaceSeedWire } from "../fixtures/demo/workspace";
import {
    createLocalPracticeMeeting,
    discardLocalPracticeMeeting,
} from "@/features/knowledge/local/practice-meeting-state";
import { advanceLocalDocument } from "@/features/knowledge/local/document-state";

function seed() {
    return decodeWorkspaceSeed(demoWorkspaceSeedWire());
}

function deps() {
    let counter = 0;
    return {
        idFactory: (prefix: string) => `${prefix}-${++counter}`,
        clock: () => `2026-10-31T00:00:0${counter}Z`,
    };
}

describe("local practice meeting state", () => {
    it("captures prompt metadata and stack bindings once and stages meeting documents", () => {
        const state = localStateFromSeed(seed());
        const result = createLocalPracticeMeeting(
            state,
            {
                name: "Temporary downside review",
                agenda: "Review the down case.",
                personaIds: ["persona-credit", "persona-downside"],
                sampleIds: [
                    "sample-shared-fact-sheet",
                    "sample-downside-retry",
                ],
            },
            seed().samples,
            seed().baseInstructions,
            deps()
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const { meeting, documents } = result.value;
        expect(meeting.meetingId.startsWith("local-")).toBe(true);
        expect(meeting.name).toBe("Temporary downside review");
        expect(meeting.agenda).toBe("Review the down case.");
        expect(meeting.participants).toHaveLength(2);
        expect(meeting.participants[0].name).toBe("Mira");
        expect(meeting.participants[0].composedPrompt).toContain(
            "You are Mira."
        );
        expect(meeting.participants[0].stackIds).toEqual([
            "shared-fact-sheet",
            "credit-evidence",
        ]);
        expect(documents).toHaveLength(2);
        expect(documents.every((document) => document.status === "pending")).toBe(
            true
        );
        expect(
            documents.every(
                (document) =>
                    document.scopeKind === "meeting" &&
                    document.scopeId === meeting.meetingId
            )
        ).toBe(true);
        expect(result.state.documents).toHaveLength(6);
    });

    it("rejects unknown personas, missing participants, and stack-only samples", () => {
        const state = localStateFromSeed(seed());
        const base = {
            name: "Practice setup",
            agenda: "Agenda",
            personaIds: ["persona-credit"],
            sampleIds: [],
        };
        expect(
            createLocalPracticeMeeting(
                state,
                { ...base, personaIds: [] },
                seed().samples,
                seed().baseInstructions,
                deps()
            )
        ).toMatchObject({ ok: false, reason: "invalid" });
        expect(
            createLocalPracticeMeeting(
                state,
                { ...base, personaIds: ["missing"] },
                seed().samples,
                seed().baseInstructions,
                deps()
            )
        ).toMatchObject({ ok: false, reason: "invalid" });
        expect(
            createLocalPracticeMeeting(
                state,
                { ...base, sampleIds: ["sample-credit-notes"] },
                seed().samples,
                seed().baseInstructions,
                deps()
            )
        ).toMatchObject({ ok: false, reason: "destination_not_allowed" });
    });

    it("discards a setup by revoking its meeting documents and ignores late transitions", () => {
        const state = localStateFromSeed(seed());
        const created = createLocalPracticeMeeting(
            state,
            {
                name: "Temporary setup",
                agenda: "Agenda",
                personaIds: ["persona-credit"],
                sampleIds: ["sample-shared-fact-sheet"],
            },
            seed().samples,
            seed().baseInstructions,
            deps()
        );
        expect(created.ok).toBe(true);
        if (!created.ok) return;
        const meetingId = created.value.meeting.meetingId;
        const documentId = created.value.documents[0].documentId;

        const discarded = discardLocalPracticeMeeting(
            created.state,
            meetingId
        );
        expect(
            discarded.practiceMeetings.some(
                (meeting) => meeting.meetingId === meetingId
            )
        ).toBe(false);
        const revoked = discarded.documents.find(
            (document) => document.documentId === documentId
        );
        expect(revoked?.status).toBe("revoked");

        const late = advanceLocalDocument(
            discarded,
            documentId,
            seed().samples.find(
                (sample) => sample.sampleId === "sample-shared-fact-sheet"
            )
        );
        expect(
            late.documents.find((document) => document.documentId === documentId)
                ?.status
        ).toBe("revoked");
    });
});
