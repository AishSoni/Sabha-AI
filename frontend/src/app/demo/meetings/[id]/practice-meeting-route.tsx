"use client";

/**
 * App-level preview composition for a local practice meeting (spec-25).
 */
import { useMemo } from "react";
import { useDemoWorkspace } from "@/features/demo-workspace";
import { EvidencePreviewProvider } from "@/features/meetings/evidence/provider";
import { EvidencePreviewHost } from "@/features/meetings/evidence/host";
import { EvidenceTrigger } from "@/features/meetings/evidence/trigger";
import { useReplaySession } from "@/features/meetings/runtime/replay-session";
import {
    createReplayEvidence,
    descriptorForAsset,
} from "@/features/meetings/runtime/replay-evidence";
import { PracticeMeetingScreen } from "./practice-meeting-screen";

export function PracticeMeetingRoute({ meetingId }: { meetingId: string }) {
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
    const previewEpoch = `${workspace.workspaceEpoch}:${workspace.local.documents
        .filter((document) => document.status === "revoked")
        .map((document) => document.documentId)
        .join(",")}`;

    return (
        <EvidencePreviewProvider adapter={evidence} epoch={previewEpoch}>
            <PracticeMeetingScreen
                meetingId={meetingId}
                originalRecordingHref={`/demo/meetings/${session.meeting_id}`}
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
