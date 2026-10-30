import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MeetingsRuntime, ReplayAsset } from "./contract";
import { MeetingsRuntimeProvider } from "./context";
import { EvidencePreviewProvider } from "../evidence/provider";
import { createReplayEvidence } from "./replay-evidence";
import { RecordedDocumentsPanel } from "./recorded-documents-panel";

const HASH = "a".repeat(64);

function makeAsset(overrides: Partial<ReplayAsset> = {}): ReplayAsset {
    return {
        asset_id: "asset",
        storage_path: "shared/asset.md",
        media_type: "text/markdown",
        sha256: HASH,
        size: 8,
        locator: "package:shared/asset.md",
        public_url: "https://assets.example/asset.md",
        source: "Prepared for this replay",
        capture_date: "2020-07-31",
        rights: "Authored for this replay",
        authored: true,
        public_demo: true,
        extraction: null,
        ...overrides,
    };
}

function renderPanel(assets: ReplayAsset[]) {
    const evidence = createReplayEvidence({ assets, claims: [] });
    const runtime = {
        scope: {
            identity: { kind: "replay", id: "run-1", epoch: 1 },
            label: "Recorded replay",
            provenance: {},
        },
        keys: {
            documents: (meetingId: string) => ["documents", meetingId],
        },
        reads: {
            documents: async () => [],
        },
        replay: { assets },
        evidence,
    } as unknown as MeetingsRuntime;
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <MeetingsRuntimeProvider runtime={runtime}>
                <EvidencePreviewProvider adapter={evidence} epoch="test">
                    <RecordedDocumentsPanel meetingId="meeting-1" />
                </EvidencePreviewProvider>
            </MeetingsRuntimeProvider>
        </QueryClientProvider>
    );
}

describe("RecordedDocumentsPanel", () => {
    it("lists every package asset with honest provenance groups", () => {
        renderPanel([
            makeAsset({
                asset_id: "crisil-annexure",
                storage_path: "evidence/crisil-annexure.md",
                source: "CRISIL Rating Rationale",
                authored: false,
                rights: "Short attributed transcription",
            }),
            makeAsset({
                asset_id: "shared-fact-sheet",
                storage_path: "shared/hdfc-v007-shared-fact-sheet.md",
                source: "Prepared for this replay",
            }),
            makeAsset({
                asset_id: "credit-evidence",
                storage_path: "private/credit-evidence.md",
                source: "Demo input",
                rights: "Demo-authored private input",
            }),
        ]);

        expect(screen.getByRole("heading", { name: "Files" })).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { name: "Retained source material" })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { name: "Prepared for this replay" })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("heading", {
                name: "Demo-authored participant inputs",
            })
        ).toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: /Preview evidence/ })).toHaveLength(
            3
        );
        expect(screen.queryByText("Upload")).not.toBeInTheDocument();
        expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    });

    it("shows an honest empty state when the package has no assets", async () => {
        renderPanel([]);

        expect(
            await screen.findByText("No files are available for this replay.")
        ).toBeInTheDocument();
    });
});
