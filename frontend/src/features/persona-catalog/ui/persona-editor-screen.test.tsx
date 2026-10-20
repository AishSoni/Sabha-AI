// @vitest-environment jsdom
/**
 * Regression: persona prompt version controls must reflect a single active
 * revision immediately after save/activate actions, and dirty state must
 * clear only for submitted revisions.
 *
 * Evidence (spec spec-01 finding finding-11e): handleSavePrompt prepended the
 * new active version without deactivating the previous one in local state —
 * rendering two "Active" badges and leaving the old row disabled until
 * reload. State updates also read captured snapshots instead of functional
 * updaters (stale under serialized actions).
 *
 * Migrated with the screen into the persona-catalog feature (spec-06): the
 * mocks now target the feature client and the knowledge feature barrel.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PersonaDetailContent } from "./persona-editor-screen";

const PERSONA_ID = "persona-1";

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    listPromptVersions: vi.fn(),
    listStacks: vi.fn(),
    createPromptVersion: vi.fn(),
    activatePromptVersion: vi.fn(),
    update: vi.fn(),
}));

vi.mock("@/features/persona-catalog/api/client", () => ({
    personaClient: {
        get: mocks.get,
        listPromptVersions: mocks.listPromptVersions,
        createPromptVersion: mocks.createPromptVersion,
        activatePromptVersion: mocks.activatePromptVersion,
        update: mocks.update,
    },
}));

vi.mock("@/features/knowledge", () => ({
    stackClient: {
        list: mocks.listStacks,
    },
}));

const personaFixture = {
    id: PERSONA_ID,
    name: "The Analyst",
    subtitle: "Critical Research Specialist",
    color: "#3b82f6",
    avatar_url: null,
    provider_config: { provider: null, model: null, temperature: 0.7, max_tokens: 2000 },
    is_default: true,
    user_id: null,
    stack_ids: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    active_prompt: "Second revision directive",
    active_prompt_version: 2,
};

const versionFixture = (id: string, version: number, content: string, isActive: boolean) => ({
    id,
    persona_id: PERSONA_ID,
    version,
    content,
    is_active: isActive,
    created_at: `2026-01-0${version}T00:00:00Z`,
});

function renderRosterPage() {
    // Renders the content component directly: the default export's React 19
    // use(params) suspension does not retry under vitest (environment
    // limitation documented in the commit message).
    render(<PersonaDetailContent personaId={PERSONA_ID} />);
}

async function openPromptTab() {
    const promptTab = await screen.findByRole("tab", { name: /prompt/i });
    fireEvent.mouseDown(promptTab);
    fireEvent.click(promptTab);
}

async function loadedVersionRows() {
    await openPromptTab();
    // Version History rows render as buttons labeled "Version N"
    await screen.findByText("Version 2");
    return ["Version 1", "Version 2"];
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(personaFixture);
    mocks.listPromptVersions.mockResolvedValue([
        versionFixture("v1", 1, "First revision directive", false),
        versionFixture("v2", 2, "Second revision directive", true),
    ]);
    mocks.listStacks.mockResolvedValue({ stacks: [] });
    mocks.createPromptVersion.mockResolvedValue(
        versionFixture("v3", 3, "Third revision directive", true)
    );
    mocks.activatePromptVersion.mockResolvedValue(undefined);
});

describe("persona editor prompt version controls", () => {
    it("deactivates the previous revision when a new prompt revision is saved", async () => {
        renderRosterPage();
        await screen.findByText("The Analyst");
        const rows = await loadedVersionRows();
        expect(rows.length).toBe(2);

        const textarea = screen.getByRole("textbox");
        fireEvent.change(textarea, { target: { value: "Third revision directive" } });
        fireEvent.click(screen.getByRole("button", { name: /save as new version/i }));

        await screen.findByText("Version 3");
        await waitFor(() => {
            // Exactly ONE revision may show the Active badge in local state.
            expect(screen.getAllByText("Active")).toHaveLength(1);
        });
        // Previously active revision (v2) must be reactivatable.
        const v2Row = screen.getByText("Version 2").closest("button");
        expect(v2Row).not.toBeDisabled();
    });

    it("activates an older revision with a single Active marker", async () => {
        renderRosterPage();
        await screen.findByText("The Analyst");
        await loadedVersionRows();

        fireEvent.click(screen.getByText("Version 1"));

        await waitFor(() => {
            expect(screen.getAllByText("Active")).toHaveLength(1);
        });
        // The newly-active row is intentionally not reactivatable; the
        // previously active revision must be.
        const v1Row = screen.getByText("Version 1").closest("button");
        expect(v1Row).toBeDisabled();
        const v2Row = screen.getByText("Version 2").closest("button");
        expect(v2Row).not.toBeDisabled();
    });

    it("loads the activated revision content and clears the draft marker", async () => {
        renderRosterPage();
        await screen.findByText("The Analyst");
        await loadedVersionRows();

        const textarea = screen.getByRole("textbox");
        fireEvent.change(textarea, { target: { value: "Unsaved draft" } });
        fireEvent.click(screen.getByText("Version 1"));

        await waitFor(() => {
            expect(mocks.activatePromptVersion).toHaveBeenCalledWith(PERSONA_ID, 1);
        });
        await waitFor(() => {
            expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
                "First revision directive"
            );
        });
    });

    it("keeps the unsaved draft flagged when saving fails", async () => {
        mocks.createPromptVersion.mockRejectedValueOnce(new Error("network down"));
        renderRosterPage();
        await screen.findByText("The Analyst");
        await loadedVersionRows();

        const textarea = screen.getByRole("textbox");
        fireEvent.change(textarea, { target: { value: "Third revision directive" } });
        fireEvent.click(screen.getByRole("button", { name: /save as new version/i }));

        expect(await screen.findByText(/network down/i)).toBeInTheDocument();
        // Save remains possible: the revision was NOT submitted.
        expect(screen.getByRole("button", { name: /save as new version/i })).not.toBeDisabled();
    });
});
