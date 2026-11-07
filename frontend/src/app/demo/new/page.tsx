"use client";

import { useState } from "react";
import Link from "next/link";
import {
    ArrowRight,
    CheckCircle2,
    FileText,
    Lock,
    ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageContainer, PageHeader } from "@/components/shell";
import { ParticipantMark } from "@/components/identity/participant-mark";
import { useDemoWorkspace } from "@/features/demo-workspace";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";
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
    const createRef = useAnchorRef("demo.create");
    const openRoomRef = useAnchorRef("demo.open-room");
    const workspace = useDemoWorkspace();
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
            setError("This recording has no supported creation step.");
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
                    : "The recorded creation step could not be loaded."
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title="Start the meeting"
                description="This is the recorded creation record for the prepared meeting. Review the fixed setup, then create the recorded intake."
                backHref="/demo"
                backLabel="Back to the board"
                meta={
                    <>
                        <Badge>Prepared demo</Badge>
                        <span className="type-meta text-ink-muted">
                            Recorded creation record · as of 31 July 2020
                        </span>
                    </>
                }
            />

            <PageContainer>
                <Notice tone="info" className="mb-6">
                    Recorded demo: the prepared setup and responses are
                    historical. Creating the intake does not call live AI and
                    never changes the recording.
                </Notice>

                {error ? (
                    <Notice tone="danger" className="mb-4">
                        {error}
                    </Notice>
                ) : null}

                <div className="material-raised mb-6 flex flex-col gap-3 rounded-group p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h2 className="type-item-title text-ink">
                            Practice with this setup
                        </h2>
                        <p className="mt-1 max-w-[68ch] type-body text-ink-secondary">
                            Open an editable copy in browser memory. Practice
                            edits never alter the recorded meeting.
                        </p>
                        {!workspace.expanded ? (
                            <p className="mt-1 type-meta text-ink-muted">
                                Practice editing is unavailable for this
                                recording version. The recorded meeting remains
                                usable.
                            </p>
                        ) : null}
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!workspace.expanded}
                        onClick={() => setEditing(true)}
                    >
                        Try editing this setup
                    </Button>
                </div>

                {created ? (
                    <section
                        aria-labelledby="intake-ready"
                        className="material-raised mb-6 rounded-group border-l-4 border-l-success p-5"
                    >
                        <div className="flex items-center gap-2 text-success">
                            <ShieldCheck aria-hidden="true" className="size-5" />
                            <h2
                                id="intake-ready"
                                className="type-section-title text-ink"
                            >
                                Recorded intake ready
                            </h2>
                        </div>
                        <p className="mt-1 type-body text-ink-secondary">
                            The prepared creation step has completed. Open the
                            room when you are ready.
                        </p>
                        <ol className="mt-4 grid gap-2 sm:grid-cols-5">
                            {(intake?.stages ?? []).map((stage) => (
                                <li
                                    key={stage.key}
                                    className="rounded-control border border-separator bg-canvas/40 p-3"
                                >
                                    <p className="type-meta-strong text-success">
                                        {stage.label}
                                    </p>
                                    <p className="mt-1 type-meta text-ink-muted">
                                        {new Date(stage.at).toLocaleTimeString(
                                            [],
                                            {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                                second: "2-digit",
                                            }
                                        )}
                                    </p>
                                </li>
                            ))}
                        </ol>
                        {intake?.note ? (
                            <p className="mt-3 type-meta text-ink-secondary">
                                {intake.note}
                            </p>
                        ) : null}
                        <Link
                            ref={openRoomRef}
                            href={`/demo/meetings/${run.session.meeting_id}?tab=chat`}
                            className="m-control mt-4 inline-flex min-h-10 items-center gap-2 rounded-control bg-action px-4 type-control font-medium text-action-foreground outline-none hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                            Open the meeting room
                            <ArrowRight aria-hidden="true" className="size-4" />
                        </Link>
                    </section>
                ) : (
                    <div className="material-raised mb-6 flex flex-col gap-3 rounded-group p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="type-item-title text-ink">
                                Create the recorded intake
                            </h2>
                            <p className="mt-1 type-body text-ink-secondary">
                                This advances the recording to its prepared
                                intake step.
                            </p>
                        </div>
                        <Button
                            ref={createRef}
                            type="button"
                            busy={busy}
                            busyLabel="Recording creation"
                            onClick={() => void create()}
                        >
                            Create recorded meeting
                        </Button>
                    </div>
                )}

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                    <section
                        aria-labelledby="recorded-setup-heading"
                        className="material-raised min-w-0 rounded-group p-5"
                    >
                        <div className="flex items-center gap-2">
                            <Lock
                                aria-hidden="true"
                                className="size-4 text-warning"
                            />
                            <h2
                                id="recorded-setup-heading"
                                className="type-section-title text-ink"
                            >
                                Recorded setup
                            </h2>
                        </div>
                        <p className="mt-1 type-meta text-ink-muted">
                            Read-only values saved with this recording.
                        </p>
                        <dl className="mt-4 grid gap-5">
                            <div>
                                <dt className="type-meta-strong uppercase tracking-wide text-ink-muted">
                                    Agenda
                                </dt>
                                <dd className="mt-1 type-body text-ink">
                                    {preset?.agenda || "No recorded agenda."}
                                </dd>
                            </div>
                            <div>
                                <dt className="type-meta-strong uppercase tracking-wide text-ink-muted">
                                    Context
                                </dt>
                                <dd className="mt-1 whitespace-pre-wrap type-body text-ink-secondary">
                                    {preset?.context ||
                                        "No recorded context."}
                                </dd>
                            </div>
                        </dl>
                    </section>

                    <aside className="material-raised h-fit rounded-group p-5">
                        <h2 className="type-section-title text-ink">Board</h2>
                        {participants.length === 0 ? (
                            <p className="mt-2 type-body text-ink-muted">
                                No recorded participants.
                            </p>
                        ) : (
                            <ul className="mt-3 space-y-3">
                                {participants.map((participant) => (
                                    <li
                                        key={participant.participant_id}
                                        className="flex items-start gap-3"
                                    >
                                        <ParticipantMark
                                            participant={{
                                                id: participant.participant_id,
                                                name: participant.name,
                                                color: participant.color,
                                            }}
                                            size="sm"
                                        />
                                        <div className="min-w-0">
                                            <p className="type-control text-ink">
                                                {participant.name}
                                            </p>
                                            <p className="type-meta text-ink-muted">
                                                {participant.role}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="mt-4 border-t border-separator pt-4">
                            <p className="type-meta-strong uppercase tracking-wide text-ink-muted">
                                Supplied document
                            </p>
                            <div className="mt-2 flex items-start gap-2">
                                <FileText
                                    aria-hidden="true"
                                    className="mt-0.5 size-4 shrink-0 text-ink-muted"
                                />
                                <div>
                                    <p className="type-control text-ink">
                                        {preset?.document_label ??
                                            "Prepared historical document"}
                                    </p>
                                    <p className="mt-1 type-meta text-ink-muted">
                                        Prepared document supplied with the
                                        recording.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>

                <p className="mt-4 flex items-center gap-2 type-meta text-ink-muted">
                    <CheckCircle2 aria-hidden="true" className="size-3.5" />
                    Recorded meeting · no live provider calls
                </p>
            </PageContainer>
        </main>
    );
}
