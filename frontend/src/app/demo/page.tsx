"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Lock, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useDemoWorkspace } from "@/features/demo-workspace";
import { useAnchorRef } from "@/features/demo-tutorial";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";

interface BoardStack {
    label: string;
    scope: "shared" | "private";
}

interface BoardParticipant {
    participant_id: string;
    name: string;
    role: string;
    persona_summary: string;
    stack_ids: string[];
    color: string;
}

interface BoardPreview {
    title?: string;
    participants?: BoardParticipant[];
    stacks?: Record<string, BoardStack>;
    preset?: {
        agenda?: string;
        context?: string;
        document_label?: string;
    };
}

export default function DemoBoardPage() {
    const run = useReplayRun();
    const workspace = useDemoWorkspace();
    const startRef = useAnchorRef("demo.start");
    const boardRef = useAnchorRef("board.roster");
    const config = run.safeConfig as { board?: BoardPreview } | null;
    const board = config?.board;
    const catalogByParticipant = new Map<string, string>();
    if (workspace.status === "ready") {
        for (const persona of workspace.seed?.personas ?? []) {
            if (persona.recordedParticipantId) {
                catalogByParticipant.set(
                    persona.recordedParticipantId,
                    persona.personaId
                );
            }
        }
    }

    if (!board) {
        return (
            <main className="mx-auto max-w-5xl p-6">
                <p className="text-sm text-ink-muted">Loading the prepared board…</p>
            </main>
        );
    }

    const participants = board.participants ?? [];
    const stacks = board.stacks ?? {};

    return (
        <main className="mx-auto max-w-5xl px-4 py-8 text-ink">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge>Prepared demo</Badge>
                        <span className="type-meta text-ink-muted">
                            Recorded responses, not live AI generation · as of 31 July 2020
                        </span>
                    </div>
                    <h1 className="type-page-title">
                        {board.title ?? "Prepared board"}
                    </h1>
                    <p className="mt-2 max-w-3xl type-body text-ink-secondary">
                        {board.preset?.context ??
                            "Inspect the prepared participants and their knowledge assignments before starting the recorded meeting."}
                    </p>
                </div>
                <Link
                    ref={startRef}
                    href="/demo/new"
                    className="m-control inline-flex min-h-10 items-center gap-2 rounded-control bg-action px-4 type-control font-medium text-action-foreground hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                    Start the meeting
                    <ArrowRight className="size-4" />
                </Link>
            </div>

            <section ref={boardRef} aria-labelledby="board-heading">
                <div className="mb-3 flex items-center gap-2">
                    <Users className="size-4 text-action" />
                    <h2 id="board-heading" className="type-control font-semibold uppercase tracking-wide text-ink-secondary">
                        Prepared participants
                    </h2>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    {participants.map((participant) => {
                        const assigned = participant.stack_ids
                            .map((id) => ({ id, ...(stacks[id] ?? { label: "Unlabeled stack", scope: "private" as const }) }))
                            .filter(Boolean);
                        const catalogPersonaId = catalogByParticipant.get(
                            participant.participant_id
                        );
                        return (
                            <Card key={participant.participant_id} className="p-5">
                                <div className="flex items-center gap-3">
                                    <span
                                        className="size-3 rounded-full"
                                        style={{ backgroundColor: participant.color }}
                                        aria-hidden="true"
                                    />
                                    <div>
                                        <h3 className="type-item-title">{participant.name}</h3>
                                        <p className="type-meta text-ink-muted">{participant.role}</p>
                                    </div>
                                </div>
                                <p className="mt-3 type-body text-ink-secondary">{participant.persona_summary}</p>
                                <details className="group mt-4 rounded-control border border-separator bg-canvas/40 p-3">
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 type-control text-ink-secondary">
                                        <span className="flex items-center gap-2">
                                            <BookOpen className="size-4 text-action" />
                                            Knowledge assignments
                                        </span>
                                        <span className="text-ink-muted group-open:hidden">Inspect</span>
                                    </summary>
                                    <ul className="mt-3 space-y-2">
                                        {assigned.map((stack) => (
                                            <li key={stack.id} className="flex items-start gap-2 type-meta text-ink-secondary">
                                                {stack.scope === "shared" ? (
                                                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                                                ) : (
                                                    <Lock className="mt-0.5 size-3.5 shrink-0 text-warning" />
                                                )}
                                                <span>
                                                    {stack.label}
                                                    <span className="ml-1 text-ink-muted">
                                                        ({stack.scope})
                                                    </span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                                {catalogPersonaId ? (
                                    <Link
                                        href={`/demo/roster/${catalogPersonaId}`}
                                        className="m-control mt-4 inline-flex items-center gap-2 type-meta font-medium text-action hover:underline"
                                    >
                                        Compare with practice template
                                        <ArrowRight className="size-3.5" />
                                    </Link>
                                ) : null}
                            </Card>
                        );
                    })}
                </div>
            </section>

            <div className="mt-6 rounded-group border border-separator bg-surface p-4 type-body text-ink-secondary">
                <p className="type-item-title">Prepared meeting preset</p>
                <p className="mt-1">{board.preset?.agenda}</p>
                <p className="mt-1 type-meta text-ink-muted">
                    Supplied document: {board.preset?.document_label}
                </p>
            </div>
        </main>
    );
}
