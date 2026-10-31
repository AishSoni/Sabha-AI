import { describe, expect, it } from "vitest";

import { collectRecordedExamples } from "./recorded-examples";

describe("collectRecordedExamples", () => {
    it("keeps only claims that explicitly cite a sample's prepared asset", () => {
        const examples = collectRecordedExamples(
            [
                {
                    sampleId: "sample-shared",
                    assetId: "shared-fact-sheet",
                    fileName: "hdfc-v007-shared-fact-sheet.md",
                },
                {
                    sampleId: "sample-credit",
                    assetId: "credit-evidence",
                    fileName: "credit-evidence.md",
                },
            ],
            [
                {
                    claim_id: "C1",
                    text: "Coupon and maturity.",
                    evidence_asset_id: "shared-fact-sheet",
                    locator: "Shared fact sheet, Terms",
                    excerpt: "7.87%",
                    source_title: "Shared fact sheet",
                },
                {
                    claim_id: "C2",
                    text: "A claim using another asset.",
                    evidence_asset_id: "downside-worksheet",
                },
                {
                    claim_id: "C3",
                    text: "No evidence asset.",
                    evidence_asset_id: null,
                },
            ]
        );

        expect(examples).toEqual([
            {
                claimId: "C1",
                sampleId: "sample-shared",
                sampleFileName: "hdfc-v007-shared-fact-sheet.md",
                text: "Coupon and maturity.",
                locator: "Shared fact sheet, Terms",
                excerpt: "7.87%",
                sourceTitle: "Shared fact sheet",
            },
        ]);
    });

    it("preserves claim order and removes duplicate sample-claim pairs", () => {
        const examples = collectRecordedExamples(
            [
                {
                    sampleId: "sample-shared",
                    assetId: "shared-fact-sheet",
                    fileName: "shared.md",
                },
            ],
            [
                {
                    claim_id: "C10",
                    text: "First.",
                    evidence_asset_id: "shared-fact-sheet",
                },
                {
                    claim_id: "C10",
                    text: "Duplicate.",
                    evidence_asset_id: "shared-fact-sheet",
                },
                {
                    claim_id: "C11",
                    text: "Second.",
                    evidence_asset_id: "shared-fact-sheet",
                },
            ]
        );

        expect(examples.map((example) => example.claimId)).toEqual([
            "C10",
            "C11",
        ]);
    });

    it("does not map evidence-only assets without an uploadable sample", () => {
        const examples = collectRecordedExamples(
            [
                {
                    sampleId: "sample-shared",
                    assetId: "shared-fact-sheet",
                    fileName: "shared.md",
                },
            ],
            [
                {
                    claim_id: "C1",
                    text: "Evidence-only.",
                    evidence_asset_id: "crisil-annexure",
                },
            ]
        );

        expect(examples).toEqual([]);
    });
});
