"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Lock, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
    const config = run.safeConfig as { board?: BoardPreview } | null;
    const board = config?.board;

    if (!board) {
        return (
            <main className="mx-auto max-w-5xl p-6">
                <p className="text-sm text-zinc-500">Loading the prepared board…</p>
            </main>
        );
    }

    const participants = board.participants ?? [];
    const stacks = board.stacks ?? {};

    return (
        <main className="mx-auto max-w-5xl px-4 py-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge className="bg-indigo-600 text-white hover:bg-indigo-600">
                            Guided replay
                        </Badge>
                        <span className="text-xs text-zinc-500">
                            Information as of 31 July 2020 · sources captured 16 October 2026
                        </span>
                    </div>
                    <h1 className="text-2xl font-semibold text-white">
                        {board.title ?? "Prepared board"}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-zinc-400">
                        {board.preset?.context ??
                            "Inspect the prepared participants and their knowledge assignments before starting the recorded meeting."}
                    </p>
                </div>
                <Link
                    href="/demo/new"
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                    Start the meeting
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </div>

            <section aria-labelledby="board-heading">
                <div className="mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-400" />
                    <h2 id="board-heading" className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                        Prepared participants
                    </h2>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    {participants.map((participant) => {
                        const assigned = participant.stack_ids
                            .map((id) => ({ id, ...(stacks[id] ?? { label: "Unlabeled stack", scope: "private" as const }) }))
                            .filter(Boolean);
                        return (
                            <Card key={participant.participant_id} className="border-zinc-800 bg-zinc-900/50 p-5">
                                <div className="flex items-center gap-3">
                                    <span
                                        className="h-3 w-3 rounded-full"
                                        style={{ backgroundColor: participant.color }}
                                        aria-hidden="true"
                                    />
                                    <div>
                                        <h3 className="font-medium text-white">{participant.name}</h3>
                                        <p className="text-xs text-zinc-500">{participant.role}</p>
                                    </div>
                                </div>
                                <p className="mt-3 text-sm text-zinc-400">{participant.persona_summary}</p>
                                <details className="group mt-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-zinc-300">
                                        <span className="flex items-center gap-2">
                                            <BookOpen className="h-4 w-4 text-indigo-400" />
                                            Knowledge assignments
                                        </span>
                                        <span className="text-zinc-500 group-open:hidden">Inspect</span>
                                    </summary>
                                    <ul className="mt-3 space-y-2">
                                        {assigned.map((stack) => (
                                            <li key={stack.id} className="flex items-start gap-2 text-xs text-zinc-400">
                                                {stack.scope === "shared" ? (
                                                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                                ) : (
                                                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                                                )}
                                                <span>
                                                    {stack.label}
                                                    <span className="ml-1 text-zinc-600">
                                                        ({stack.scope})
                                                    </span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            </Card>
                        );
                    })}
                </div>
            </section>

            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
                <p className="font-medium text-zinc-300">Prepared meeting preset</p>
                <p className="mt-1">{board.preset?.agenda}</p>
                <p className="mt-1 text-xs text-zinc-500">
                    Supplied document: {board.preset?.document_label}
                </p>
            </div>
        </main>
    );
}
