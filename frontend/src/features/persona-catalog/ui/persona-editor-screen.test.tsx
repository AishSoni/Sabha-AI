// @vitest-environment jsdom
/**
 * Regression coverage for the shared persona editor.
 *
 * The editor is the base app's screen, now fed by an injected client. These
 * tests pin the parts Spec 24 must not regress: exactly one active revision,
 * metadata vs prompt separation, explicit inspection without activation,
 * draft protection, and stale-response handling.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

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
    await screen.findByRole("button", { name: "Make version 1 active" });
    await screen.findByRole("button", { name: "Make version 2 active" });
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
        await loadedVersionRows();

        const textarea = screen.getByRole("textbox");
        fireEvent.change(textarea, { target: { value: "Third revision directive" } });
        fireEvent.click(screen.getByRole("button", { name: /save as new version/i }));

        await screen.findByText("Version 3");
        await waitFor(() => {
            // Exactly ONE revision may show the Active badge in local state.
            expect(screen.getAllByText("Active")).toHaveLength(1);
        });
        // Previously active revision (v2) must be reactivatable.
        expect(screen.getByRole("button", { name: "Make version 2 active" })).not.toBeDisabled();
    });

    it("activates an older revision with a single Active marker", async () => {
        renderRosterPage();
        await screen.findByText("The Analyst");
        await loadedVersionRows();

        fireEvent.click(screen.getByRole("button", { name: "Make version 1 active" }));

        await waitFor(() => {
            expect(mocks.activatePromptVersion).toHaveBeenCalledWith(PERSONA_ID, 1);
        });
        await waitFor(() => {
            expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
                "First revision directive"
            );
        });
        await waitFor(() => {
            expect(screen.getAllByText("Active")).toHaveLength(1);
        });
        // The newly-active row is intentionally not reactivatable; the
        // previously active revision must be.
        expect(screen.getByRole("button", { name: "Make version 1 active" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Make version 2 active" })).not.toBeDisabled();
    });

    it("inspects a revision without activating it or mutating the draft", async () => {
        renderRosterPage();
        await screen.findByText("The Analyst");
        await loadedVersionRows();

        fireEvent.click(screen.getByRole("button", { name: "View version 1" }));

        expect(await screen.findByLabelText("Version 1 content")).toBeInTheDocument();
        expect(screen.getByText("First revision directive")).toBeInTheDocument();
        expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
            "Second revision directive"
        );
        expect(mocks.activatePromptVersion).not.toHaveBeenCalled();
        expect(screen.getAllByText("Active")).toHaveLength(1);
        expect(screen.getByRole("status")).toHaveTextContent("Viewing version 1");
    });

    it("asks before replacing an unsaved draft with an activation", async () => {
        renderRosterPage();
        await screen.findByText("The Analyst");
        await loadedVersionRows();

        const textarea = screen.getByRole("textbox");
        fireEvent.change(textarea, { target: { value: "Unsaved draft" } });
        fireEvent.click(screen.getByRole("button", { name: "Make version 1 active" }));

        const dialog = await screen.findByRole("alertdialog", {
            name: "Confirm revision activation",
        });
        expect(mocks.activatePromptVersion).not.toHaveBeenCalled();

        fireEvent.click(
            screen.getByRole("button", { name: "Discard draft and activate version 1" })
        );

        await waitFor(() => {
            expect(mocks.activatePromptVersion).toHaveBeenCalledWith(PERSONA_ID, 1);
        });
        await waitFor(() => {
            expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
                "First revision directive"
            );
        });
        expect(dialog).not.toBeInTheDocument();
    });

    it("keeps the draft when the activation confirmation is cancelled", async () => {
        renderRosterPage();
        await screen.findByText("The Analyst");
        await loadedVersionRows();

        const textarea = screen.getByRole("textbox");
        fireEvent.change(textarea, { target: { value: "Unsaved draft" } });
        fireEvent.click(screen.getByRole("button", { name: "Make version 1 active" }));

        const dialog = await screen.findByRole("alertdialog", {
            name: "Confirm revision activation",
        });
        fireEvent.keyDown(dialog, { key: "Escape" });

        await waitFor(() => {
            expect(
                screen.queryByRole("alertdialog", { name: "Confirm revision activation" })
            ).not.toBeInTheDocument();
        });
        expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Unsaved draft");
        expect(mocks.activatePromptVersion).not.toHaveBeenCalled();
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

    it("does not erase text typed while an earlier save is in flight", async () => {
        const pending = deferred<ReturnType<typeof versionFixture>>();
        mocks.createPromptVersion.mockReturnValueOnce(pending.promise);
        renderRosterPage();
        await screen.findByText("The Analyst");
        await loadedVersionRows();

        const textarea = screen.getByRole("textbox");
        fireEvent.change(textarea, { target: { value: "Third revision directive" } });
        fireEvent.click(screen.getByRole("button", { name: /save as new version/i }));
        fireEvent.change(textarea, { target: { value: "Fourth revision directive" } });

        await act(async () => {
            pending.resolve(versionFixture("v3", 3, "Third revision directive", true));
            await pending.promise;
        });

        expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
            "Fourth revision directive"
        );
        expect(screen.getByRole("button", { name: /save as new version/i })).not.toBeDisabled();
    });

    it("warns before leaving with an unsaved draft", async () => {
        renderRosterPage();
        await screen.findByText("The Analyst");
        await openPromptTab();

        fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unsaved draft" } });
        fireEvent.click(screen.getByLabelText("Back to roster"));

        expect(
            await screen.findByRole("alertdialog", { name: "Unsaved system prompt" })
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
        expect(
            screen.queryByRole("alertdialog", { name: "Unsaved system prompt" })
        ).not.toBeInTheDocument();
    });
});
