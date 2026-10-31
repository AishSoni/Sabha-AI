"use client";

import { useMemo } from "react";
import { useDemoWorkspace } from "@/features/demo-workspace";
import { DemoStackDetail } from "@/features/knowledge/local";
import { EvidencePreviewProvider } from "@/features/meetings/evidence/provider";
import { EvidencePreviewHost } from "@/features/meetings/evidence/host";
import { EvidenceTrigger } from "@/features/meetings/evidence/trigger";
import { useReplaySession } from "@/features/meetings/runtime/replay-session";
import {
    createReplayEvidence,
    descriptorForAsset,
} from "@/features/meetings/runtime/replay-evidence";

/**
 * App-level composition for practice stack previews. It reuses the recorded
 * package's bounded evidence loader and viewer; the knowledge feature itself
 * only receives a rendered preview action.
 */
export function DemoKnowledgeStackRoute({ stackId }: { stackId: string }) {
    const { session } = useReplaySession();
    const workspace = useDemoWorkspace();
    const evidence = useMemo(
        () =>
            createReplayEvidence({
                assets: session.assets,
                claims: session.claims,
            }),
        [session]
    );
    const assetsById = useMemo(
        () => new Map(session.assets.map((asset) => [asset.asset_id, asset])),
        [session.assets]
    );
    const revokedIds = workspace.local.documents
        .filter((document) => document.status === "revoked")
        .map((document) => document.documentId)
        .join(",");
    const previewEpoch = `${workspace.workspaceEpoch}:${revokedIds}`;

    return (
        <EvidencePreviewProvider adapter={evidence} epoch={previewEpoch}>
            <DemoStackDetail
                stackId={stackId}
                renderPreviewAction={(sample) => {
                    const asset = assetsById.get(sample.assetId);
                    if (!asset) return null;
                    return (
                        <EvidenceTrigger
                            descriptor={{
                                ...descriptorForAsset(asset),
                                title: sample.fileName,
                            }}
                            label="Preview source"
                        />
                    );
                }}
            />
            <EvidencePreviewHost />
        </EvidencePreviewProvider>
    );
}
