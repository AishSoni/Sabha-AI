"use client";

/**
 * App-level practice setup composition for `/demo/new` (spec-25).
 *
 * The route composes the package's bounded evidence viewer around the shared
 * creation screen, so previews are real package bytes while the knowledge
 * feature keeps no reverse dependency on meeting runtime internals.
 */
import { useMemo } from "react";
import { useDemoWorkspace } from "@/features/demo-workspace";
import { EvidencePreviewProvider } from "@/features/meetings/evidence/provider";
import { EvidencePreviewHost } from "@/features/meetings/evidence/host";
import { EvidenceTrigger } from "@/features/meetings/evidence/trigger";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";
import { useReplaySession } from "@/features/meetings/runtime/replay-session";
import {
    createReplayEvidence,
    descriptorForAsset,
} from "@/features/meetings/runtime/replay-evidence";
import { PracticeSetupScreen } from "./practice-setup-screen";

export function PracticeSetupRoute({ onExit }: { onExit: () => void }) {
    const run = useReplayRun();
    const { session } = useReplaySession();
    const workspace = useDemoWorkspace();
    const config = run.safeConfig as
        | {
              board?: {
                  preset?: { agenda?: string; context?: string };
              };
          }
        | null;
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
    const recordedCreated =
        run.checkpoint !== run.session.initial_checkpoint;
    const originalHref = recordedCreated
        ? `/demo/meetings/${run.session.meeting_id}`
        : "/demo";

    return (
        <EvidencePreviewProvider adapter={evidence} epoch={previewEpoch}>
            <PracticeSetupScreen
                key={workspace.workspaceEpoch}
                initialAgenda={config?.board?.preset?.agenda ?? ""}
                initialContext={config?.board?.preset?.context ?? ""}
                recordedCreated={recordedCreated}
                originalRecordingHref={originalHref}
                onExit={onExit}
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
