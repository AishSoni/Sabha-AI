/**
 * Maps approved uploadable samples to recorded claims that cite the same
 * package asset. The package already validates every claim's evidence asset;
 * this helper adds the sample-to-asset identity check, so a mapping exists only
 * when both sides explicitly reference the same prepared bytes.
 */
import type { RecordedExampleView } from "../presentation/recorded-examples";

export interface RecordedClaimLike {
    claim_id: string;
    text: string;
    evidence_asset_id: string | null;
    locator?: string | null;
    excerpt?: string | null;
    source_title?: string | null;
}

export interface RecordedSampleLike {
    sampleId: string;
    assetId: string;
    fileName: string;
}

export function collectRecordedExamples(
    samples: RecordedSampleLike[],
    claims: RecordedClaimLike[]
): RecordedExampleView[] {
    const samplesByAsset = new Map<string, RecordedSampleLike>();
    for (const sample of samples) {
        if (!samplesByAsset.has(sample.assetId)) {
            samplesByAsset.set(sample.assetId, sample);
        }
    }

    const examples: RecordedExampleView[] = [];
    const seen = new Set<string>();
    for (const claim of claims) {
        if (!claim.evidence_asset_id) continue;
        const sample = samplesByAsset.get(claim.evidence_asset_id);
        if (!sample) continue;
        const key = `${sample.sampleId}:${claim.claim_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        examples.push({
            claimId: claim.claim_id,
            sampleId: sample.sampleId,
            sampleFileName: sample.fileName,
            text: claim.text,
            locator: claim.locator ?? null,
            excerpt: claim.excerpt ?? null,
            sourceTitle: claim.source_title ?? null,
        });
    }
    return examples;
}
