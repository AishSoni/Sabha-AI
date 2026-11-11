import { describe, expect, it } from "vitest";
import type { LocalOutcome, WorkspaceLocalState } from "@/features/demo-workspace";
import { createPersonaClient } from "../model/client";
import { createLocalPersonaRequest } from "./transport";

function workspace(): WorkspaceLocalState {
    return {
        personas: [
            {
                personaId: "persona-1",
                name: "Mira",
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
        participantSnapshots: [],
        documents: [],
    };
}

function harness(options?: { wait?: () => Promise<void> }) {
    let current = workspace();
    let epoch = 1;
    let counter = 0;
    const commit = (
        update: (state: WorkspaceLocalState) => WorkspaceLocalState
    ): LocalOutcome<void> => {
        const next = update(current);
        if (next === current) {
            return { ok: true, scope: "local", value: undefined };
        }
        current = next;
        return { ok: true, scope: "local", value: undefined };
    };
    const client = createPersonaClient(
        createLocalPersonaRequest({
            getState: () => current,
            commit,
            getEpoch: () => epoch,
            isCurrentEpoch: (value) => value === epoch,
            baseInstructions: "BASE",
            idFactory: () => `id-${++counter}`,
            clock: () => `2026-10-31T00:00:0${counter}Z`,
            wait: options?.wait,
        })
    );
    return {
        client,
        getState: () => current,
        resetEpoch: () => {
            epoch += 1;
        },
    };
}

describe("local persona request transport", () => {
    it("serves the canonical list and persona shapes through the shared client", async () => {
        const { client } = harness();
        const listed = await client.list();
        expect(listed.total).toBe(1);
        expect(listed.personas[0]).toMatchObject({
            id: "persona-1",
            subtitle: "Credit Analyst",
            active_prompt: "Second prompt",
            active_prompt_version: 2,
            stack_ids: ["shared", "private"],
        });

        const persona = await client.get("persona-1");
        expect(persona.active_prompt_version).toBe(2);
        const versions = await client.listPromptVersions("persona-1");
        expect(versions.map((version) => version.is_active)).toEqual([false, true]);
    });

    it("creates a persona whose first revision is active", async () => {
        const { client, getState } = harness();
        const created = await client.create({
            name: "New Analyst",
            subtitle: "Analyst",
            color: "#10b981",
            system_prompt: "New prompt",
            stack_ids: ["shared"],
        });
        expect(created.active_prompt).toBe("New prompt");
        expect(created.active_prompt_version).toBe(1);
        expect(created.stack_ids).toEqual(["shared"]);
        expect(getState().personas).toHaveLength(2);
        expect(
            getState().personas.find((persona) => persona.personaId === created.id)
                ?.revisions[0]?.origin
        ).toBe("local");
    });

    it("keeps metadata saves separate from prompt history", async () => {
        const { client } = harness();
        const updated = await client.update("persona-1", {
            name: "Renamed",
            stack_ids: [],
        });
        expect(updated.name).toBe("Renamed");
        expect(updated.stack_ids).toEqual([]);
        const versions = await client.listPromptVersions("persona-1");
        expect(versions).toHaveLength(2);
        expect(versions.find((version) => version.is_active)?.version).toBe(2);
    });

    it("appends and activates a saved revision atomically", async () => {
        const { client } = harness();
        const saved = await client.createPromptVersion("persona-1", "Third prompt");
        expect(saved.version).toBe(3);
        expect(saved.is_active).toBe(true);
        const versions = await client.listPromptVersions("persona-1");
        expect(versions.filter((version) => version.is_active)).toHaveLength(1);
        expect(versions.find((version) => version.is_active)?.content).toBe(
            "Third prompt"
        );
        const persona = await client.get("persona-1");
        expect(persona.active_prompt_version).toBe(3);
    });

    it("restores an older revision without rewriting it", async () => {
        const { client } = harness();
        await client.activatePromptVersion("persona-1", 1);
        const versions = await client.listPromptVersions("persona-1");
        expect(versions.filter((version) => version.is_active)).toHaveLength(1);
        expect(versions.find((version) => version.is_active)?.content).toBe(
            "First prompt"
        );
        expect(versions[1]?.content).toBe("Second prompt");
        const persona = await client.get("persona-1");
        expect(persona.active_prompt_version).toBe(1);
    });

    it("matches the live duplicate request without copying stacks or history", async () => {
        const { client, getState } = harness();
        const created = await client.create({
            name: "Mira (Copy)",
            subtitle: "Credit Analyst",
            color: "#2563eb",
            system_prompt: "Second prompt",
        });
        expect(created.stack_ids).toEqual([]);
        const versions = await client.listPromptVersions(created.id);
        expect(versions).toHaveLength(1);
        expect(versions[0]?.content).toBe("Second prompt");
        expect(getState().personas).toHaveLength(2);
        expect(
            getState().personas.find((persona) => persona.personaId === "persona-1")
                ?.revisions
        ).toHaveLength(2);
    });

    it("rejects unknown stacks and missing personas without partial state", async () => {
        const { client, getState } = harness();
        await expect(
            client.create({ name: "Valid", system_prompt: "x", stack_ids: ["missing"] })
        ).rejects.toThrow(/Unknown knowledge stack/);
        expect(getState().personas).toHaveLength(1);
        await expect(client.get("missing")).rejects.toThrow(/Persona not found/);
    });

    it("refuses a completion after the workspace resets", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const { client, resetEpoch } = harness({ wait: () => gate });
        const pending = client.get("persona-1");
        resetEpoch();
        release();
        await expect(pending).rejects.toThrow(/workspace was reset/i);
    });
});
