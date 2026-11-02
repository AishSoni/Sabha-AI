// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    DemoWorkspaceProvider,
    decodeWorkspaceSeed,
    useDemoWorkspace,
    type WorkspacePublishedAsset,
} from "@/features/demo-workspace";
import {
    useLocalDocuments,
} from "./use-local-documents";
import {
    DEMO_PINNED_IDENTITY,
    demoWorkspaceSeedEnvelope,
    demoWorkspaceSeedWire,
} from "../../../../tests/fixtures/demo/workspace";

function json(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as unknown as Response;
}

const seed = decodeWorkspaceSeed(demoWorkspaceSeedWire());
const samples = seed.samples;
const publishedAssets: WorkspacePublishedAsset[] = Array.from(
    new Set(samples.map((sample) => sample.assetId))
).map((assetId) => {
    const sample = samples.find((candidate) => candidate.assetId === assetId)!;
    return {
        assetId,
        publicUrl: `https://assets.example.test/${sample.fileName}`,
        mediaType: sample.mediaType,
        sha256: sample.sha256,
        sizeBytes: sample.sizeBytes,
    };
});

const verifySample = vi.fn(async () => undefined);
const now = () => new Date("2026-10-31T12:00:00.000Z");
let sequence = 0;
const idFactory = (prefix: string) => `${prefix}-${++sequence}`;

function Probe({ stackId = "credit-evidence" }: { stackId?: string }) {
    const workspace = useDemoWorkspace();
    const adapter = useLocalDocuments(
        { kind: "stack", id: stackId },
        {
            verifySample,
            now,
            idFactory,
            queueDelayMs: 5,
            indexingDelayMs: 5,
        }
    );
    return (
        <div>
            <span data-testid="status">{workspace.status}</span>
            <span data-testid="counts">
                {adapter.counts.total}/{adapter.counts.ready}
            </span>
            <span data-testid="uploading">{String(adapter.uploading)}</span>
            <span data-testid="error">{adapter.localError ?? ""}</span>
            <span data-testid="rows">
                {adapter.documents
                    .map(
                        (document) =>
                            `${document.file_name}:${document.status}:${document.chunk_count}:${document.operation_id}`
                    )
                    .join("|")}
            </span>
            <button
                type="button"
                onClick={() => void adapter.addSample(samples[1])}
            >
                add credit
            </button>
            <button
                type="button"
                onClick={() => void adapter.addSample(samples[3])}
            >
                add downside
            </button>
            <button
                type="button"
                onClick={() => {
                    const doc = adapter.documents[0];
                    adapter.retryDocument(doc.operation_id ?? "");
                }}
            >
                retry
            </button>
            <button
                type="button"
                onClick={() => {
                    const doc = adapter.documents[0];
                    adapter.removeDocument(doc);
                }}
            >
                remove
            </button>
        </div>
    );
}

function renderProbe(stackId?: string) {
    return render(
        <DemoWorkspaceProvider
            identity={DEMO_PINNED_IDENTITY}
            publishedAssets={publishedAssets}
        >
            <Probe stackId={stackId} />
        </DemoWorkspaceProvider>
    );
}

async function waitForEmptyScope() {
    await waitFor(() =>
        expect(screen.getByTestId("status").textContent).toBe("ready")
    );
    // Every seeded stack carries one ready document; clear it so each case
    // starts from an empty scope.
    fireEvent.click(screen.getByRole("button", { name: "remove" }));
    await waitFor(() =>
        expect(screen.getByTestId("counts").textContent).toBe("0/0")
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
    verifySample.mockClear();
    sequence = 0;
});

describe("local practice documents", () => {
    it("stages one approved sample through queued and indexing to ready", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => json(200, demoWorkspaceSeedEnvelope()))
        );
        renderProbe();
        await waitForEmptyScope();

        fireEvent.click(screen.getByRole("button", { name: "add credit" }));

        await waitFor(() =>
            expect(screen.getByTestId("rows").textContent).toContain(
                "credit-evidence.md:ready:2:practice-operation-2"
            )
        );
        expect(screen.getByTestId("counts").textContent).toBe("1/1");
        expect(verifySample).toHaveBeenCalledWith(
            samples[1],
            publishedAssets.find(
                (asset) => asset.assetId === samples[1].assetId
            )
        );
    });

    it("rejects the same sample twice in one destination but allows another destination", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => json(200, demoWorkspaceSeedEnvelope()))
        );
        renderProbe();
        await waitForEmptyScope();

        fireEvent.click(screen.getByRole("button", { name: "add credit" }));
        await waitFor(() =>
            expect(screen.getByTestId("rows").textContent).toContain("ready")
        );
        fireEvent.click(screen.getByRole("button", { name: "add credit" }));

        await waitFor(() =>
            expect(screen.getByTestId("error").textContent).toBe(
                "This sample is already added in this destination."
            )
        );
        expect(screen.getByTestId("counts").textContent).toBe("1/1");
        expect(verifySample).toHaveBeenCalledTimes(1);
    });

    it("fails once, then retries the same document and operation identity to ready", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => json(200, demoWorkspaceSeedEnvelope()))
        );
        renderProbe();
        await waitForEmptyScope();

        fireEvent.click(screen.getByRole("button", { name: "add downside" }));
        await waitFor(() =>
            expect(screen.getByTestId("rows").textContent).toContain(
                ":failed:0:"
            )
        );
        const before = screen.getByTestId("rows").textContent!;
        const operation = before.split(":")[3];

        fireEvent.click(screen.getByRole("button", { name: "retry" }));
        await waitFor(() =>
            expect(screen.getByTestId("rows").textContent).toContain(
                ":ready:3:"
            )
        );
        const after = screen.getByTestId("rows").textContent!;
        expect(after).toContain(`downside-worksheet.md:ready:3:${operation}`);
        expect(screen.getByTestId("counts").textContent).toBe("1/1");

        const local = screen.getByTestId("rows").textContent!;
        expect(local.split(":")[3]).toBe(operation);
    });

    it("revokes eligibility immediately and ignores a later processing completion", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => json(200, demoWorkspaceSeedEnvelope()))
        );
        renderProbe();
        await waitForEmptyScope();

        fireEvent.click(screen.getByRole("button", { name: "add downside" }));
        await waitFor(() =>
            expect(screen.getByTestId("rows").textContent).toContain(
                ":processing:"
            )
        );
        fireEvent.click(screen.getByRole("button", { name: "remove" }));

        await waitFor(() =>
            expect(screen.getByTestId("counts").textContent).toBe("0/0")
        );
        await new Promise((resolve) => setTimeout(resolve, 40));
        expect(screen.getByTestId("counts").textContent).toBe("0/0");
        expect(screen.getByTestId("rows").textContent).toBe("");
    });

    it("does not stage a sample whose source fails verification", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => json(200, demoWorkspaceSeedEnvelope()))
        );
        verifySample.mockRejectedValueOnce(new Error("offline"));
        renderProbe();
        await waitForEmptyScope();

        fireEvent.click(screen.getByRole("button", { name: "add credit" }));
        await waitFor(() =>
            expect(screen.getByTestId("error").textContent).toBe(
                "The prepared sample could not be verified."
            )
        );
        expect(screen.getByTestId("counts").textContent).toBe("0/0");
        expect(screen.getByTestId("rows").textContent).toBe("");
    });
});
