// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    DemoWorkspaceProvider,
    decodeWorkspaceSeed,
    decodeWorkspaceSeedEnvelope,
    useDemoWorkspace,
} from "@/features/demo-workspace";
import {
    DEMO_PINNED_IDENTITY,
    demoWorkspaceSeedEnvelope,
    demoWorkspaceSeedWire,
} from "../fixtures/demo/workspace";

function json(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as unknown as Response;
}

function installSeedFetch(body: unknown, status = 200) {
    const calls: string[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: unknown) => {
            calls.push(String(input));
            return json(status, body);
        })
    );
    return calls;
}

function Probe() {
    const workspace = useDemoWorkspace();
    return (
        <div>
            <span data-testid="status">{workspace.status}</span>
            <span data-testid="epoch">{workspace.workspaceEpoch}</span>
            <span data-testid="reset-epoch">{workspace.workspaceResetEpoch}</span>
            <span data-testid="expanded">{String(workspace.expanded)}</span>
            <span data-testid="dirty">{String(workspace.hasPracticeEdits)}</span>
            <span data-testid="personas">{workspace.local.personas.length}</span>
            <span data-testid="stacks">{workspace.local.stacks.length}</span>
            <span data-testid="documents">{workspace.local.documents.length}</span>
            <span data-testid="samples">{workspace.seed?.samples.length ?? 0}</span>
            <span data-testid="bookmark">{workspace.guideBookmark ?? "none"}</span>
            <span data-testid="reset-reason">{workspace.playbackReset.reason}</span>
            <span data-testid="reset-nonce">{workspace.playbackReset.nonce}</span>
            <span data-testid="error">{workspace.error ?? ""}</span>
            <button
                type="button"
                onClick={() =>
                    workspace.commitLocal((current) => ({
                        ...current,
                        stacks: current.stacks.slice(0, -1),
                    }))
                }
            >
                edit
            </button>
            <button
                type="button"
                onClick={() => workspace.setGuideBookmark("establish-facts")}
            >
                bookmark
            </button>
            <button type="button" onClick={workspace.restartRecording}>
                restart
            </button>
            <button type="button" onClick={workspace.resetWorkspace}>
                reset
            </button>
        </div>
    );
}

function renderWorkspace() {
    return render(
        <DemoWorkspaceProvider identity={DEMO_PINNED_IDENTITY}>
            <Probe />
        </DemoWorkspaceProvider>
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("demo workspace provider", () => {
    it("loads the pinned seed once and exposes the practice catalog", async () => {
        const calls = installSeedFetch(demoWorkspaceSeedEnvelope());
        renderWorkspace();

        await waitFor(() =>
            expect(screen.getByTestId("status").textContent).toBe("ready")
        );
        expect(screen.getByTestId("expanded").textContent).toBe("true");
        expect(screen.getByTestId("personas").textContent).toBe("3");
        expect(screen.getByTestId("stacks").textContent).toBe("4");
        expect(screen.getByTestId("samples").textContent).toBe("4");
        expect(screen.getByTestId("documents").textContent).toBe("4");
        expect(screen.getByTestId("dirty").textContent).toBe("false");
        expect(calls).toHaveLength(1);
        expect(calls[0]).toContain("package=hdfc-ine001a07rw5");
        expect(calls[0]).toContain("version=2");
    });

    it("restart recording keeps practice edits and clears the guide bookmark", async () => {
        installSeedFetch(demoWorkspaceSeedEnvelope());
        renderWorkspace();
        await waitFor(() =>
            expect(screen.getByTestId("status").textContent).toBe("ready")
        );

        const startingEpoch = Number(screen.getByTestId("epoch").textContent);
        const startingResetEpoch = Number(
            screen.getByTestId("reset-epoch").textContent
        );
        fireEvent.click(screen.getByRole("button", { name: "edit" }));
        fireEvent.click(screen.getByRole("button", { name: "bookmark" }));
        expect(screen.getByTestId("dirty").textContent).toBe("true");
        expect(screen.getByTestId("stacks").textContent).toBe("3");

        fireEvent.click(screen.getByRole("button", { name: "restart" }));

        expect(screen.getByTestId("dirty").textContent).toBe("true");
        expect(screen.getByTestId("stacks").textContent).toBe("3");
        expect(screen.getByTestId("bookmark").textContent).toBe("none");
        expect(screen.getByTestId("reset-reason").textContent).toBe("recording");
        expect(screen.getByTestId("reset-nonce").textContent).toBe("1");
        // Restarting playback is not a practice reset: pending work and drafts
        // keep their epoch, while a full workspace reset invalidates them.
        expect(Number(screen.getByTestId("epoch").textContent)).toBe(
            startingEpoch
        );
        expect(
            Number(screen.getByTestId("reset-epoch").textContent)
        ).toBe(startingResetEpoch);
    });

    it("reset workspace restores the seed and discards practice edits", async () => {
        installSeedFetch(demoWorkspaceSeedEnvelope());
        renderWorkspace();
        await waitFor(() =>
            expect(screen.getByTestId("status").textContent).toBe("ready")
        );

        fireEvent.click(screen.getByRole("button", { name: "edit" }));
        const startingResetEpoch = Number(
            screen.getByTestId("reset-epoch").textContent
        );
        fireEvent.click(screen.getByRole("button", { name: "reset" }));

        expect(screen.getByTestId("dirty").textContent).toBe("false");
        expect(screen.getByTestId("stacks").textContent).toBe("4");
        expect(screen.getByTestId("documents").textContent).toBe("4");
        expect(screen.getByTestId("reset-reason").textContent).toBe("workspace");
        expect(screen.getByTestId("reset-nonce").textContent).toBe("1");
        expect(
            Number(screen.getByTestId("reset-epoch").textContent)
        ).toBe(startingResetEpoch + 1);
    });

    it("keeps the original journey available when the package has no seed", async () => {
        installSeedFetch(
            { detail: "replay_workspace_seed_unavailable" },
            404
        );
        renderWorkspace();

        await waitFor(() =>
            expect(screen.getByTestId("status").textContent).toBe("legacy")
        );
        expect(screen.getByTestId("expanded").textContent).toBe("false");
        expect(screen.getByTestId("error").textContent).toContain(
            "original guided journey is unchanged"
        );
    });

    it("fails closed when the seed identity does not match the pin", async () => {
        const envelope = demoWorkspaceSeedEnvelope();
        installSeedFetch({ ...envelope, content_sha256: "b".repeat(64) });
        renderWorkspace();

        await waitFor(() =>
            expect(screen.getByTestId("status").textContent).toBe("mismatch")
        );
        expect(screen.getByTestId("expanded").textContent).toBe("false");
        expect(screen.getByTestId("error").textContent).toContain(
            "does not match the pinned recording"
        );
    });
});

describe("workspace seed decoder", () => {
    it("rejects an active revision that is not present", () => {
        const seed = demoWorkspaceSeedWire();
        seed.personas[0].active_revision_id = "rev-missing";
        expect(() =>
            decodeWorkspaceSeedEnvelope({
                package_id: "pkg",
                version: "1",
                content_sha256: "a".repeat(64),
                seed_version: 1,
                seed,
            })
        ).toThrow(/active revision is missing/);
    });

    it("rejects a persona stack that is not seeded", () => {
        const seed = demoWorkspaceSeedWire();
        seed.personas[0].stack_ids = ["missing-stack"];
        expect(() =>
            decodeWorkspaceSeedEnvelope({
                package_id: "pkg",
                version: "1",
                content_sha256: "a".repeat(64),
                seed_version: 1,
                seed,
            })
        ).toThrow(/stack is not seeded/);
    });

    it("rejects an unsupported seed version", () => {
        const seed = demoWorkspaceSeedWire();
        expect(() =>
            decodeWorkspaceSeedEnvelope({
                package_id: "pkg",
                version: "1",
                content_sha256: "a".repeat(64),
                seed_version: 99,
                seed: { ...seed, seed_version: 99 },
            })
        ).toThrow(/unsupported seed version/);
    });

    it("requires base instructions and a highlighted persona for seed version 2", () => {
        const seed = demoWorkspaceSeedWire();
        expect(() =>
            decodeWorkspaceSeed({ ...seed, base_instructions: undefined })
        ).toThrow(/requires base instructions/);
        expect(() =>
            decodeWorkspaceSeed({ ...seed, highlighted_persona_id: "persona-missing" })
        ).toThrow(/highlighted persona is missing/);
    });

    it("decodes the version 3 upload allowlist and seeded documents", () => {
        const decoded = decodeWorkspaceSeed(demoWorkspaceSeedWire());
        expect(decoded.seedVersion).toBe(3);
        expect(decoded.samples.map((sample) => sample.sampleId)).toEqual([
            "sample-shared-fact-sheet",
            "sample-credit-notes",
            "sample-portfolio-mandate",
            "sample-downside-retry",
        ]);
        expect(decoded.documents).toHaveLength(4);
        expect(
            decoded.documents.map((document) => document.chunkCount).sort()
        ).toEqual([2, 3, 3, 4]);
        expect(decoded.samples[3]?.failureMessage).toContain(
            "Retry reuses this same document and operation"
        );
    });

    it("rejects samples that are not approved for upload", () => {
        const seed = demoWorkspaceSeedWire();
        seed.samples[0].rights_status = "redistribution-review";
        expect(() => decodeWorkspaceSeed(seed)).toThrow(
            /unsupported value redistribution-review/
        );
    });

    it("rejects duplicate sample ids and mismatched seeded chunk counts", () => {
        const duplicate = demoWorkspaceSeedWire();
        duplicate.samples[1].sample_id = duplicate.samples[0].sample_id;
        expect(() => decodeWorkspaceSeed(duplicate)).toThrow(
            /sample ids must be unique/
        );

        const mismatch = demoWorkspaceSeedWire();
        mismatch.documents[0].chunk_count = 99;
        expect(() => decodeWorkspaceSeed(mismatch)).toThrow(
            /chunk count does not match the prepared sample/
        );
    });

    it("rejects sample fields in older seed versions", () => {
        const seed = demoWorkspaceSeedWire();
        expect(() =>
            decodeWorkspaceSeed({
                ...seed,
                seed_version: 2,
            })
        ).toThrow(/sample library requires seed version 3/);
    });

    it("still decodes a version 1 seed without prompt assembly metadata", () => {
        const seed = demoWorkspaceSeedWire();
        const decoded = decodeWorkspaceSeed({
            ...seed,
            seed_version: 1,
            base_instructions: undefined,
            highlighted_persona_id: undefined,
            samples: undefined,
            documents: undefined,
            personas: seed.personas.map((persona) => {
                const rest: Record<string, unknown> = { ...persona };
                delete rest.recorded_participant_id;
                return rest;
            }),
        });
        expect(decoded.seedVersion).toBe(1);
        expect(decoded.baseInstructions).toBeNull();
        expect(decoded.highlightedPersonaId).toBeNull();
    });
});
