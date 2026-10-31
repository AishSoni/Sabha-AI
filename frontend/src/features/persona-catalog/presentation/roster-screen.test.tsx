// @vitest-environment jsdom
/**
 * Characterization of the base roster command flow (spec-24).
 *
 * The demo uses this same screen through the in-memory transport. This test
 * pins the live request body so a future local adapter cannot quietly diverge.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PersonaCatalogClient } from "../model/client";
import type { Persona } from "../model/types";
import { RosterScreen } from "./roster-screen";

const persona: Persona = {
    id: "persona-1",
    name: "The Credit Analyst",
    subtitle: "Credit Analyst",
    color: "#2563eb",
    avatar_url: null,
    provider_config: { provider: null, model: null, temperature: null, max_tokens: null },
    is_default: false,
    stack_ids: ["shared", "private"],
    user_id: null,
    created_at: "2026-10-24",
    updated_at: "2026-10-30",
    active_prompt: "Prompt v3",
    active_prompt_version: 3,
};

function fakeClient(): PersonaCatalogClient {
    return {
        list: vi.fn().mockResolvedValue({ personas: [persona], total: 1 }),
        get: vi.fn(),
        create: vi.fn().mockResolvedValue({
            ...persona,
            id: "persona-2",
            name: "The Credit Analyst (Copy)",
        }),
        update: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
        listPromptVersions: vi.fn(),
        createPromptVersion: vi.fn(),
        activatePromptVersion: vi.fn(),
    };
}

async function openActions(name: string) {
    fireEvent.pointerDown(
        screen.getByRole("button", { name: `Actions for ${name}` })
    );
}

describe("shared roster command flow", () => {
    it("duplicates metadata and the active prompt without stack ids or history", async () => {
        const client = fakeClient();
        render(
            <RosterScreen
                client={client}
                hrefs={{ home: "/", create: "/roster/new", persona: (id) => `/roster/${id}` }}
            />
        );
        await screen.findByText("The Credit Analyst");

        await openActions("The Credit Analyst");
        fireEvent.click(await screen.findByText("Duplicate"));

        expect(client.create).toHaveBeenCalledWith({
            name: "The Credit Analyst (Copy)",
            subtitle: "Credit Analyst",
            color: "#2563eb",
            system_prompt: "Prompt v3",
        });
        expect(client.create).not.toHaveBeenCalledWith(
            expect.objectContaining({ stack_ids: expect.anything() })
        );
        expect(
            await screen.findByText("The Credit Analyst (Copy)")
        ).toBeInTheDocument();
    });

    it("confirms deletion and removes only the selected catalog entry", async () => {
        const client = fakeClient();
        render(
            <RosterScreen
                client={client}
                hrefs={{ home: "/", create: "/roster/new", persona: (id) => `/roster/${id}` }}
                confirmDelete={() => true}
            />
        );
        await screen.findByText("The Credit Analyst");

        await openActions("The Credit Analyst");
        fireEvent.click(await screen.findByText("Delete"));

        await waitFor(() =>
            expect(client.delete).toHaveBeenCalledWith("persona-1")
        );
        expect(
            screen.queryByText("The Credit Analyst")
        ).not.toBeInTheDocument();
    });
});
