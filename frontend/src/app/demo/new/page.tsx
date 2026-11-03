"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, Lock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDemoWorkspace } from "@/features/demo-workspace";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";
import { useAnchorRef } from "@/features/demo-tutorial";
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
    const createRef = useAnchorRef("demo.create");
    const openRoomRef = useAnchorRef("demo.open-room");
    const workspace = useDemoWorkspace();
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const config = run.safeConfig as SafeConfig | null;
    const preset = config?.board?.preset;
    const participants = config?.board?.participants ?? [];
    const intake = config?.intake;
    const created = run.checkpoint !== run.session.initial_checkpoint;

    if (editing) {
        return <PracticeSetupRoute onExit={() => setEditing(false)} />;
    }

    const create = async () => {
        setError(null);
        const intent = run.session.intents.find(
            (item) => item.kind === "create_meeting"
        );
        if (!intent) {
            setError("This recording has no supported creation step.");
            return;
        }
        setBusy(true);
        try {
            await run.startIntent(intent.intent_id);
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "The recorded creation step could not be loaded."
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="mx-auto max-w-4xl px-4 py-8">
            <div className="mb-6">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className="bg-indigo-600 text-white hover:bg-indigo-600">
                        Prepared demo
                    </Badge>
                    <span className="text-xs text-zinc-500">Recorded creation record</span>
                </div>
                <h1 className="text-2xl font-semibold text-white">Start the meeting</h1>
                <p className="mt-2 text-sm text-zinc-400">
                    This is the recorded creation record for the prepared meeting.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-zinc-700 text-zinc-200"
                        disabled={!workspace.expanded}
                        onClick={() => setEditing(true)}
                    >
                        Try editing this setup
                    </Button>
                    <span className="text-xs text-zinc-500">
                        Practice only · changes stay in this browser and never alter
                        the recording.
                    </span>
                </div>
                {!workspace.expanded ? (
                    <p className="mt-2 text-xs text-zinc-500">
                        Practice editing is unavailable for this recording
                        version. The recorded meeting remains usable.
                    </p>
                ) : null}
            </div>

            <div className="space-y-4">
                <Card className="border-zinc-800 bg-zinc-900/50 p-5">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-400">
                        <Lock className="h-4 w-4" />
                        Recorded setup
                    </div>
                    <div className="mt-3 grid gap-4">
                        <label className="grid gap-1 text-sm">
                            <span className="text-zinc-400">Agenda</span>
                            <input
                                readOnly
                                value={preset?.agenda ?? ""}
                                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-200"
                            />
                        </label>
                        <label className="grid gap-1 text-sm">
                            <span className="text-zinc-400">Context</span>
                            <textarea
                                readOnly
                                rows={4}
                                value={preset?.context ?? ""}
                                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-200"
                            />
                        </label>
                    </div>
                </Card>

                <Card className="border-zinc-800 bg-zinc-900/50 p-5">
                    <h2 className="text-sm font-semibold text-zinc-300">Board</h2>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {participants.map((participant) => (
                            <div
                                key={participant.participant_id}
                                className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"
                            >
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                    <span className="text-sm font-medium text-white">
                                        {participant.name}
                                    </span>
                                </div>
                                <p className="mt-1 text-xs text-zinc-500">{participant.role}</p>
                            </div>
                        ))}
                    </div>
                </Card>

                <Card className="border-zinc-800 bg-zinc-900/50 p-5">
                    <h2 className="text-sm font-semibold text-zinc-300">Supplied document</h2>
                    <div className="mt-3 flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                        <FileText className="mt-0.5 h-5 w-5 text-indigo-400" />
                        <div>
                            <p className="text-sm font-medium text-white">
                                {preset?.document_label ?? "Prepared historical document"}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                                Prepared document supplied with the recording.
                            </p>
                        </div>
                    </div>
                </Card>

                {error ? (
                    <p className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
                        {error}
                    </p>
                ) : null}

                {created ? (
                    <Card className="border-emerald-900/60 bg-emerald-950/20 p-5">
                        <div className="flex items-center gap-2 text-emerald-300">
                            <ShieldCheck className="h-5 w-5" />
                            <h2 className="font-medium">Recorded intake ready</h2>
                        </div>
                        <ol className="mt-4 grid gap-2 sm:grid-cols-5">
                            {(intake?.stages ?? []).map((stage) => (
                                <li
                                    key={stage.key}
                                    className="rounded-lg border border-emerald-900/40 bg-zinc-950/40 p-2 text-xs"
                                >
                                    <p className="font-medium text-emerald-200">{stage.label}</p>
                                    <p className="mt-1 text-zinc-500">
                                        {new Date(stage.at).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            second: "2-digit",
                                        })}
                                    </p>
                                </li>
                            ))}
                        </ol>
                        <p className="mt-3 text-xs text-zinc-400">{intake?.note}</p>
                        <Link
                            ref={openRoomRef}
                            href={`/demo/meetings/${run.session.meeting_id}?tab=chat`}
                            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                        >
                            Open the meeting room
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </Card>
                ) : (
                    <Button
                        ref={createRef}
                        onClick={() => void create()}
                        disabled={busy}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        {busy ? "Recording creation…" : "Create recorded meeting"}
                    </Button>
                )}

            </div>
        </main>
    );
}
