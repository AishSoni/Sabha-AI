"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Lock, ShieldCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader, LoadingState } from "@/components/shell";
import { ParticipantMark } from "@/components/identity/participant-mark";
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
            <main id="main-content" tabIndex={-1}>
                <PageContainer>
                    <LoadingState label="Loading the prepared board…" rows={3} />
                </PageContainer>
            </main>
        );
    }

    const participants = board.participants ?? [];
    const stacks = board.stacks ?? {};

    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title={board.title ?? "Prepared board"}
                description={
                    board.preset?.context ??
                    "Inspect the prepared participants and their knowledge assignments before starting the recorded meeting."
                }
                meta={
                    <>
                        <Badge>Prepared demo</Badge>
                        <span className="type-meta text-ink-muted">
                            Recorded responses, not live AI generation · as of 31
                            July 2020
                        </span>
                    </>
                }
                actions={
                    <Link
                        ref={startRef}
                        href="/demo/new"
                        className="m-control inline-flex min-h-10 items-center gap-2 rounded-control bg-action px-4 type-control font-medium text-action-foreground outline-none hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        Start the meeting
                        <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                }
            />

            <PageContainer>
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
                    <section
                        ref={boardRef}
                        aria-labelledby="board-heading"
                        className="min-w-0"
                    >
                        <div className="mb-3 flex items-center gap-2">
                            <Users
                                aria-hidden="true"
                                className="size-4 text-ink-muted"
                            />
                            <h2
                                id="board-heading"
                                className="type-section-title text-ink"
                            >
                                Prepared participants
                            </h2>
                            <span className="type-meta text-ink-muted">
                                {participants.length}
                            </span>
                        </div>

                        {participants.length === 0 ? (
                            <EmptyState
                                title="No prepared participants"
                                description="This recording does not include a participant roster."
                                className="material-raised rounded-group"
                            />
                        ) : (
                            <ul className="material-raised divide-y divide-separator overflow-hidden rounded-group">
                                {participants.map((participant) => {
                                    const assigned = participant.stack_ids.map(
                                        (id) => ({
                                            id,
                                            ...(stacks[id] ?? {
                                                label: "Unlabeled stack",
                                                scope: "private" as const,
                                            }),
                                        })
                                    );
                                    const catalogPersonaId =
                                        catalogByParticipant.get(
                                            participant.participant_id
                                        );
                                    return (
                                        <li
                                            key={participant.participant_id}
                                            className="grid gap-4 p-5 sm:grid-cols-[auto_minmax(0,1fr)]"
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
                                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                                    <h3 className="type-item-title text-ink">
                                                        {participant.name}
                                                    </h3>
                                                    <p className="type-meta text-ink-muted">
                                                        {participant.role}
                                                    </p>
                                                </div>
                                                <p className="mt-1 max-w-[68ch] type-body text-ink-secondary">
                                                    {participant.persona_summary}
                                                </p>

                                                <details className="group mt-3 rounded-control border border-separator bg-canvas/40 p-3">
                                                    <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 type-control text-ink-secondary">
                                                        <BookOpen
                                                            aria-hidden="true"
                                                            className="size-4"
                                                        />
                                                        Knowledge assignments
                                                    </summary>
                                                    <ul className="mt-2 space-y-2">
                                                        {assigned.length === 0 ? (
                                                            <li className="type-meta text-ink-muted">
                                                                No knowledge
                                                                material assigned
                                                                to this participant.
                                                            </li>
                                                        ) : (
                                                            assigned.map(
                                                                (stack) => (
                                                                    <li
                                                                        key={
                                                                            stack.id
                                                                        }
                                                                        className="flex items-start gap-2 type-meta text-ink-secondary"
                                                                    >
                                                                        {stack.scope ===
                                                                        "shared" ? (
                                                                            <ShieldCheck
                                                                                aria-hidden="true"
                                                                                className="mt-0.5 size-3.5 shrink-0 text-success"
                                                                            />
                                                                        ) : (
                                                                            <Lock
                                                                                aria-hidden="true"
                                                                                className="mt-0.5 size-3.5 shrink-0 text-warning"
                                                                            />
                                                                        )}
                                                                        <span>
                                                                            <span className="type-meta-strong text-ink">
                                                                                {stack.scope ===
                                                                                "shared"
                                                                                    ? "Shared"
                                                                                    : "Assigned"}
                                                                            </span>{" "}
                                                                            {stack.label}
                                                                        </span>
                                                                    </li>
                                                                )
                                                            )
                                                        )}
                                                    </ul>
                                                </details>

                                                {catalogPersonaId ? (
                                                    <Link
                                                        href={`/demo/roster/${catalogPersonaId}`}
                                                        className="m-control mt-3 inline-flex min-h-9 items-center gap-2 rounded-control type-meta font-medium text-action outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                                    >
                                                        Compare with practice
                                                        template
                                                        <ArrowRight
                                                            aria-hidden="true"
                                                            className="size-3.5"
                                                        />
                                                    </Link>
                                                ) : null}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>

                    <aside className="material-raised h-fit rounded-group p-5">
                        <h2 className="type-section-title text-ink">
                            Prepared agenda
                        </h2>
                        <p className="mt-2 type-body text-ink-secondary">
                            {board.preset?.agenda ||
                                "No agenda was saved with this recording."}
                        </p>
                        <div className="mt-4 border-t border-separator pt-4">
                            <p className="type-meta-strong uppercase tracking-wide text-ink-muted">
                                Supplied document
                            </p>
                            <p className="mt-1 type-body text-ink-secondary">
                                {board.preset?.document_label ||
                                    "No document label was saved."}
                            </p>
                        </div>
                    </aside>
                </div>
            </PageContainer>
        </main>
    );
}
