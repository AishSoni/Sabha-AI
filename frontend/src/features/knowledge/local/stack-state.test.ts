import { describe, expect, it } from "vitest";
import {
    localStateFromSeed,
    type WorkspaceDocument,
    type WorkspaceSeed,
} from "@/features/demo-workspace";
import {
    assignedPersonas,
    createLocalStack,
    deleteLocalStack,
    stackDocumentCounts,
    stackParticipants,
    updateLocalStack,
} from "./stack-state";

function seed(): WorkspaceSeed {
    return {
        seedVersion: 3,
        baseInstructions: "Base instructions.",
        highlightedPersonaId: "persona-credit",
        disclosure: { practice: "Practice.", recording: "Recording." },
        personas: [
            {
                personaId: "persona-credit",
                name: "Mira",
                role: "Credit Analyst",
                description: "Credit.",
                color: "#2563eb",
                stackIds: ["credit-stack", "shared-stack"],
                revisions: [
                    {
                        revisionId: "rev-credit",
                        prompt: "Credit prompt.",
                        reason: "Initial.",
                        createdAt: "2026-10-31",
                    },
                ],
                activeRevisionId: "rev-credit",
            },
            {
                personaId: "persona-downside",
                name: "Arjun",
                role: "Risk Reviewer",
                description: "Risk.",
                color: "#b45309",
                stackIds: ["credit-stack"],
                revisions: [
                    {
                        revisionId: "rev-downside",
                        prompt: "Downside prompt.",
                        reason: "Initial.",
                        createdAt: "2026-10-31",
                    },
                ],
                activeRevisionId: "rev-downside",
            },
        ],
        stacks: [
            {
                stackId: "credit-stack",
                label: "Credit stack",
                scope: "private",
                description: "Private notes.",
            },
            {
                stackId: "shared-stack",
                label: "Shared stack",
                scope: "shared",
                description: "Shared notes.",
            },
        ],
        practiceSetups: [],
        samples: [],
        documents: [],
    };
}

function document(
    documentId: string,
    scopeId: string,
    status: WorkspaceDocument["status"] = "ready"
): WorkspaceDocument {
    return {
        documentId,
        sampleId: "sample-credit",
        scopeKind: "stack",
        scopeId,
        status,
        operationId: `operation-${documentId}`,
        revisionId: `revision-${documentId}`,
        chunkCount: status === "ready" ? 2 : 0,
        createdAt: "2026-10-31",
        errorMessage: null,
        origin: "local",
    };
}

describe("practice knowledge stack state", () => {
    it("creates and renames a stack with a bounded name", () => {
        const created = createLocalStack(localStateFromSeed(seed()), {
            stackId: "new-stack",
            name: "  New knowledge stack  ",
            description: "  Temporary contents.  ",
        });
        expect(created.ok).toBe(true);
        if (!created.ok) return;
        expect(created.stack).toMatchObject({
            stackId: "new-stack",
            label: "New knowledge stack",
            description: "Temporary contents.",
            scope: "shared",
        });

        const renamed = updateLocalStack(created.state, "new-stack", {
            name: "Renamed stack",
            description: "Still temporary.",
        });
        expect(renamed.ok).toBe(true);
        if (!renamed.ok) return;
        expect(renamed.stack.label).toBe("Renamed stack");
        expect(renamed.state.stacks).toHaveLength(3);
    });

    it("rejects empty and overlong names and unknown stacks", () => {
        const state = localStateFromSeed(seed());
        expect(
            createLocalStack(state, {
                stackId: "new",
                name: "   ",
                description: "",
            })
        ).toEqual({ ok: false, reason: "invalid_name" });
        expect(
            createLocalStack(state, {
                stackId: "new",
                name: "n".repeat(101),
                description: "",
            })
        ).toEqual({ ok: false, reason: "invalid_name" });
        expect(
            updateLocalStack(state, "missing", {
                name: "Rename",
                description: "",
            })
        ).toEqual({ ok: false, reason: "not_found" });
    });

    it("counts active documents and reports assigned personas", () => {
        const state = localStateFromSeed(seed());
        const counted = {
            ...state,
            documents: [
                document("ready", "credit-stack"),
                document("failed", "credit-stack", "failed"),
                document("removed", "credit-stack", "revoked"),
                document("other", "shared-stack"),
            ],
        };

        expect(stackDocumentCounts(counted, "credit-stack")).toEqual({
            total: 2,
            ready: 1,
        });
        expect(assignedPersonas(counted, "credit-stack")).toEqual([
            "Mira",
            "Arjun",
        ]);
    });

    it("separates template defaults from captured participant assignments", () => {
        const state = localStateFromSeed(seed());
        const withSnapshot = {
            ...state,
            participantSnapshots: [
                {
                    snapshotId: "snapshot-credit",
                    personaId: "persona-credit",
                    name: "Mira",
                    role: "Credit Analyst",
                    color: "#2563eb",
                    composedPrompt: "Credit prompt.",
                    stackIds: ["credit-stack"],
                    sourceRevisionId: "rev-credit",
                    sourceRevisionNumber: 1,
                    createdAt: "2026-10-31",
                },
            ],
        };

        expect(stackParticipants(withSnapshot, "credit-stack")).toEqual({
            templateDefaults: ["Mira", "Arjun"],
            savedParticipants: ["Mira"],
        });
        expect(stackParticipants(withSnapshot, "shared-stack")).toEqual({
            templateDefaults: ["Mira"],
            savedParticipants: [],
        });
    });

    it("revokes stack documents first, clears current defaults, and keeps saved snapshot refs unavailable", () => {
        const state = localStateFromSeed(seed());
        const withDocuments = {
            ...state,
            documents: [
                document("credit-ready", "credit-stack"),
                document("credit-processing", "credit-stack", "processing"),
                document("shared-ready", "shared-stack"),
            ],
            participantSnapshots: [
                {
                    snapshotId: "snapshot-credit",
                    personaId: "persona-credit",
                    name: "Mira",
                    role: "Credit Analyst",
                    color: "#2563eb",
                    composedPrompt: "Credit prompt.",
                    stackIds: ["credit-stack", "shared-stack"],
                    sourceRevisionId: "rev-credit",
                    sourceRevisionNumber: 1,
                    createdAt: "2026-10-31",
                },
            ],
        };

        const deleted = deleteLocalStack(withDocuments, "credit-stack");

        expect(deleted.stacks.map((stack) => stack.stackId)).toEqual([
            "shared-stack",
        ]);
        expect(
            deleted.documents
                .filter((entry) => entry.scopeId === "credit-stack")
                .every(
                    (entry) =>
                        entry.status === "revoked" &&
                        entry.chunkCount === 0 &&
                        Boolean(entry.revokedAt)
                )
        ).toBe(true);
        expect(
            deleted.documents.find(
                (entry) => entry.documentId === "shared-ready"
            )?.status
        ).toBe("ready");
        expect(
            deleted.personas.find(
                (persona) => persona.personaId === "persona-credit"
            )?.stackIds
        ).toEqual(["shared-stack"]);
        expect(deleted.participantSnapshots[0].stackIds).toEqual([
            "credit-stack",
            "shared-stack",
        ]);
        expect(deleted.participantSnapshots[0].unavailableStackIds).toEqual([
            "credit-stack",
        ]);
    });

    it("leaves unrelated state unchanged when deleting a missing stack", () => {
        const state = localStateFromSeed(seed());
        expect(deleteLocalStack(state, "missing")).toBe(state);
    });
});
