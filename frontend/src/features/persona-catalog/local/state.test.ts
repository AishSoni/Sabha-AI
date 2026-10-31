import { describe, expect, it } from "vitest";
import type { WorkspaceLocalState } from "@/features/demo-workspace";
import {
    activateRevision,
    captureSnapshot,
    createPersona,
    deletePersona,
    duplicatePersona,
    saveRevision,
    updatePersona,
} from "./state";

function workspace(): WorkspaceLocalState {
    return {
        personas: [
            {
                personaId: "persona-1",
                name: "The Credit Analyst",
                role: "Credit Analyst",
                description: "Tests the record.",
                color: "#2563eb",
                stackIds: ["shared", "private"],
                revisions: [
                    {
                        revisionId: "rev-1",
                        prompt: "First prompt",
                        reason: "Initial authored role.",
                        createdAt: "2026-10-24",
                        origin: "seed",
                    },
                    {
                        revisionId: "rev-2",
                        prompt: "Second prompt",
                        reason: "Adds evidence discipline.",
                        createdAt: "2026-10-27",
                        origin: "seed",
                    },
                ],
                activeRevisionId: "rev-2",
                recordedParticipantId: "participant-1",
            },
        ],
        stacks: [
            {
                stackId: "shared",
                label: "Shared",
                scope: "shared",
                description: "Shared documents.",
            },
            {
                stackId: "private",
                label: "Private",
                scope: "private",
                description: "Private documents.",
            },
        ],
        practiceSetups: [],
        practiceMeetings: [],
        participantSnapshots: [],
        documents: [],
    };
}

function deps() {
    let counter = 0;
    return {
        idFactory: () => `id-${++counter}`,
        clock: () => `2026-10-31T00:00:0${counter}Z`,
    };
}

describe("local persona catalog state", () => {
    it("creates a persona with one active initial revision", () => {
        const result = createPersona(
            workspace(),
            {
                name: "New Analyst",
                subtitle: "Analyst",
                color: "#10b981",
                system_prompt: "New prompt",
                stack_ids: ["shared", "shared"],
            },
            deps()
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const persona = result.value.persona;
        expect(persona.name).toBe("New Analyst");
        expect(persona.role).toBe("Analyst");
        expect(persona.stackIds).toEqual(["shared"]);
        expect(persona.revisions).toHaveLength(1);
        expect(persona.revisions[0]?.origin).toBe("local");
        expect(persona.activeRevisionId).toBe(persona.revisions[0]?.revisionId);
        expect(result.state.personas[0]?.personaId).toBe(persona.personaId);
    });

    it("rejects invalid names, colors, and unknown stacks without partial state", () => {
        const state = workspace();
        expect(
            createPersona(state, { name: "   ", system_prompt: "x" }, deps()).ok
        ).toBe(false);
        expect(
            createPersona(state, { name: "Valid", color: "blue" }, deps()).ok
        ).toBe(false);
        expect(
            createPersona(
                state,
                { name: "Valid", system_prompt: "x", stack_ids: ["missing"] },
                deps()
            ).ok
        ).toBe(false);
        expect(state.personas).toHaveLength(1);
    });

    it("saves metadata without touching prompt history", () => {
        const state = workspace();
        const result = updatePersona(state, "persona-1", {
            name: "Renamed",
            stack_ids: [],
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.persona.name).toBe("Renamed");
        expect(result.value.persona.stackIds).toEqual([]);
        expect(result.value.persona.revisions).toEqual(
            state.personas[0]?.revisions
        );
        expect(result.value.persona.activeRevisionId).toBe("rev-2");
    });

    it("appends and activates one immutable revision", () => {
        const state = workspace();
        const result = saveRevision(state, "persona-1", "Third prompt", deps());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const persona = result.value.persona;
        expect(persona.revisions.map((revision) => revision.prompt)).toEqual([
            "First prompt",
            "Second prompt",
            "Third prompt",
        ]);
        expect(persona.activeRevisionId).toBe(result.value.revision.revisionId);
        expect(
            persona.revisions.filter(
                (revision) => revision.revisionId === persona.activeRevisionId
            )
        ).toHaveLength(1);
        expect(state.personas[0]?.revisions).toHaveLength(2);
    });

    it("activates an older revision without rewriting content", () => {
        const state = workspace();
        const result = activateRevision(state, "persona-1", 1);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.persona.activeRevisionId).toBe("rev-1");
        expect(result.value.persona.revisions).toEqual(
            state.personas[0]?.revisions
        );
        const repeated = activateRevision(result.state, "persona-1", 1);
        expect(repeated.ok).toBe(true);
        if (repeated.ok) expect(repeated.state).toBe(result.state);
    });

    it("duplicates metadata and the active prompt without stack ids or history", () => {
        const state = workspace();
        const result = duplicatePersona(state, "persona-1", deps());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const persona = result.value.persona;
        expect(persona.name).toBe("The Credit Analyst (Copy)");
        expect(persona.stackIds).toEqual([]);
        expect(persona.revisions).toHaveLength(1);
        expect(persona.revisions[0]?.prompt).toBe("Second prompt");
        expect(persona.revisions[0]?.origin).toBe("local");
        expect(persona.personaId).not.toBe("persona-1");
        expect(persona.revisions[0]?.revisionId).not.toBe("rev-1");
        expect(state.personas[0]?.revisions).toHaveLength(2);
    });

    it("deletes the catalog entry but keeps captured snapshots", () => {
        const state = workspace();
        const captured = captureSnapshot(state, "persona-1", "BASE", deps());
        expect(captured.ok).toBe(true);
        if (!captured.ok) return;
        const result = deletePersona(captured.state, "persona-1");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.personas).toHaveLength(0);
        expect(result.state.participantSnapshots).toHaveLength(1);
        expect(result.state.participantSnapshots[0]?.composedPrompt).toBe(
            "BASE\n\nSecond prompt"
        );
    });

    it("captures a snapshot that does not change when the template changes", () => {
        const state = workspace();
        const captured = captureSnapshot(state, "persona-1", "BASE", deps());
        expect(captured.ok).toBe(true);
        if (!captured.ok) return;
        const snapshot = captured.value.snapshot;
        expect(snapshot.sourceRevisionNumber).toBe(2);
        expect(snapshot.stackIds).toEqual(["shared", "private"]);

        const changed = saveRevision(
            captured.state,
            "persona-1",
            "Changed prompt",
            deps()
        );
        expect(changed.ok).toBe(true);
        if (!changed.ok) return;
        expect(changed.state.participantSnapshots[0]).toEqual(snapshot);
        expect(
            changed.state.personas[0]?.revisions.find(
                (revision) => revision.revisionId === "rev-2"
            )?.prompt
        ).toBe("Second prompt");
    });

    it("returns not-found for unknown personas and versions", () => {
        const state = workspace();
        expect(updatePersona(state, "missing", { name: "x" }).ok).toBe(false);
        expect(deletePersona(state, "missing").ok).toBe(false);
        expect(saveRevision(state, "missing", "x", deps()).ok).toBe(false);
        expect(activateRevision(state, "persona-1", 9).ok).toBe(false);
    });
});
