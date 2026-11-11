"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, Lock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDemoWorkspace } from "@/features/demo-workspace";
import { DemoMeetingDocuments } from "@/features/knowledge/local";
import { EvidencePreviewHost } from "@/features/meetings/evidence/host";
import { EvidencePreviewProvider } from "@/features/meetings/evidence/provider";
import { EvidenceTrigger } from "@/features/meetings/evidence/trigger";
import {
    createReplayEvidence,
    descriptorForAsset,
} from "@/features/meetings/runtime/replay-evidence";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";
import { useReplaySessionReady } from "@/features/meetings/runtime/replay-session";
import { markTutorialFact, useAnchorRef } from "@/features/demo-tutorial";
import { PracticeSetupRoute } from "./practice-setup-route";

interface Preset {
    agenda?: string;
    context?: string;
    participant_ids?: string[];
    document_id?: string;
    document_label?: string;
}

interface IntakeStage {
    key: string;
    label: string;
    at: string;
}

interface BoardParticipant {
    participant_id: string;
    name: string;
    role: string;
    persona_summary: string;
    stack_ids: string[];
    color: string;
}

interface BoardConfig {
    preset?: Preset;
    participants?: BoardParticipant[];
}

interface IntakeConfig {
    stages?: IntakeStage[];
    note?: string;
}

interface SafeConfig {
    board?: BoardConfig;
    intake?: IntakeConfig;
}

export default function DemoNewMeetingPage() {
    const run = useReplayRun();
    const { session } = useReplaySessionReady();
    const createRef = useAnchorRef("demo.create");
    const openRoomRef = useAnchorRef("demo.open-room");
    const setupRef = useAnchorRef("screen.setup");
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
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [createdLocally, setCreatedLocally] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const config = run.safeConfig as SafeConfig | null;
    const preset = config?.board?.preset;
    const participants = config?.board?.participants ?? [];
    const intake = config?.intake;
    const deck = run.session.prepared_turns.length > 0;
    // A schema-3 deck starts from its prepared base snapshot, so the recorded
    // setup submission is the local creation outcome, not a checkpoint switch.
    const created = deck
        ? createdLocally
        : run.checkpoint !== run.session.initial_checkpoint;

    if (editing) {
        return <PracticeSetupRoute onExit={() => setEditing(false)} />;
    }

    const create = async () => {
        setError(null);
        const intent = run.session.intents.find(
            (item) => item.kind === "create_meeting"
        );
        if (!intent) {
            setError("This demo has no supported creation step.");
            return;
        }
        setBusy(true);
        try {
            await run.startIntent(intent.intent_id);
            markTutorialFact("demo.intake");
            if (deck) setCreatedLocally(true);
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "The demo creation step could not be loaded."
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <EvidencePreviewProvider adapter={evidence} epoch={previewEpoch}>
        <main id="main-content" className="mx-auto max-w-4xl px-4 py-8" tabIndex={-1}>
            <div className="mb-6">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge>Demo</Badge>
                    <span className="text-xs text-ink-muted">Creation record</span>
                </div>
                <h1 className="text-2xl font-semibold text-ink">Create meeting</h1>
                <p className="mt-2 text-sm text-ink-secondary">
                    This is the creation record for the demo meeting.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!workspace.expanded}
                        onClick={() => setEditing(true)}
                    >
                        Try editing this setup
                    </Button>
                    <span className="text-xs text-ink-muted">
                        Practice only · changes stay in this browser and never alter
                        the recording.
                    </span>
                </div>
                {!workspace.expanded ? (
                    <p className="mt-2 text-xs text-ink-muted">
                        Practice editing is unavailable for this recording
                        version. The recorded meeting remains usable.
                    </p>
                ) : null}
            </div>

            {error ? (
                <p className="mb-4 rounded-lg border border-danger/60 bg-danger-soft p-3 text-sm text-danger">
                    {error}
                </p>
            ) : null}

            {created ? (
                <Card className="mb-4 border-success/50 bg-success-soft p-5">
                    <div className="flex items-center gap-2 text-success">
                        <ShieldCheck className="h-5 w-5" />
                        <h2 className="font-medium">Meeting created</h2>
                    </div>
                    <ol className="mt-4 grid gap-2 sm:grid-cols-5">
                        {(intake?.stages ?? []).map((stage) => (
                            <li
                                key={stage.key}
                                className="rounded-lg border border-success/40 bg-canvas/40 p-2 text-xs"
                            >
                                <p className="font-medium text-success">{stage.label}</p>
                                <p className="mt-1 text-ink-muted">
                                    {new Date(stage.at).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        second: "2-digit",
                                    })}
                                </p>
                            </li>
                        ))}
                    </ol>
                    <p className="mt-3 text-xs text-ink-secondary">{intake?.note}</p>
                    <Link
                        ref={openRoomRef}
                        href={`/demo/meetings/${run.session.meeting_id}?tab=chat`}
                        className="m-control mt-4 inline-flex items-center gap-2 rounded-control bg-action px-4 py-2 type-control font-medium text-action-foreground hover:bg-action-hover"
                    >
                        Open the meeting room
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </Card>
            ) : (
                <Button
                    ref={createRef}
                    onClick={() => void create()}
                    busy={busy}
                    busyLabel="Creating meeting"
                    className="mb-4"
                >
                    Create meeting
                </Button>
            )}

            <div className="space-y-4">
                <Card ref={setupRef} className="p-5">
                    <div className="flex items-center gap-2 type-meta font-medium uppercase tracking-wide text-warning">
                        <Lock className="h-4 w-4" />
                        Meeting setup
                    </div>
                    <div className="mt-3 grid gap-4">
                        <label className="grid gap-1">
                            <span className="type-control text-ink-secondary">Meeting title</span>
                            <input
                                readOnly
                                value={preset?.agenda ?? ""}
                                className="rounded-control border border-control bg-surface-raised px-3 py-2 type-body text-ink"
                            />
                        </label>
                        <label className="grid gap-1">
                            <span className="type-control text-ink-secondary">Context</span>
                            <textarea
                                readOnly
                                rows={4}
                                value={preset?.context ?? ""}
                                className="rounded-control border border-control bg-surface-raised px-3 py-2 type-body text-ink"
                            />
                        </label>
                    </div>
                </Card>

                <Card className="p-5">
                    <h2 className="type-control font-semibold text-ink-secondary">Participants</h2>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {participants.map((participant) => (
                            <div
                                key={participant.participant_id}
                                className="rounded-control border border-separator bg-surface-raised/50 p-3"
                            >
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-success" />
                                    <span className="text-sm font-medium text-ink">
                                        {participant.name}
                                    </span>
                                </div>
                                <p className="mt-1 text-xs text-ink-muted">{participant.role}</p>
                            </div>
                        ))}
                    </div>
                </Card>

                <Card className="p-5">
                    <h2 className="type-control font-semibold text-ink-secondary">Document</h2>
                    <div className="mt-3 flex items-start gap-3 rounded-control border border-separator bg-surface-raised/50 p-3">
                        <FileText className="mt-0.5 h-5 w-5 text-action" />
                        <div>
                            <p className="text-sm font-medium text-ink">
                                {preset?.document_label ?? "Historical document"}
                            </p>
                            <p className="mt-1 text-xs text-ink-muted">
                                Document supplied with the demo.
                            </p>
                        </div>
                    </div>
                    <DemoMeetingDocuments
                        meetingId={session.meeting_id}
                        mode="setup"
                        className="mt-4 space-y-3 border-t border-separator pt-4"
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
                </Card>

            </div>
        </main>
        <EvidencePreviewHost />
        </EvidencePreviewProvider>
    );
}
