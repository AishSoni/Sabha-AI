"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ParticipantMark } from "@/components/identity/participant-mark";
import { useAnchorRef } from "@/features/demo-tutorial";
import type {
    Consensus,
    Disagreement,
    MeetingWithParticipants,
    Message,
} from "../api/decoders";
import { CitationsBlock, type CitationView } from "./CitationsBlock";
import { EvidenceCitationTrigger } from "../evidence/trigger";

export interface DemoOutcomePanelProps {
    meeting: MeetingWithParticipants;
    disagreements: Disagreement[];
    consensus: Consensus[];
    summary: string | null;
    archived: boolean;
}

function messageCitations(messages: Message[]): CitationView[] {
    const seen = new Set<string>();
    const citations: CitationView[] = [];
    for (const message of messages) {
        for (const citation of message.citations ?? []) {
            const source =
                citation.source ?? citation.title ?? "Recorded source";
            const key = [
                citation.claim_id ?? "",
                citation.document_id ?? "",
                citation.revision_id ?? "",
                citation.chunk_id ?? "",
                source,
                citation.title ?? "",
                citation.url ?? "",
            ].join("\u0000");
            if (seen.has(key)) continue;
            seen.add(key);
            citations.push({
                source,
                title: citation.title ?? undefined,
                url: citation.url ?? undefined,
                snippet: citation.snippet ?? undefined,
                claim_id: citation.claim_id ?? undefined,
                locator: citation.locator ?? undefined,
                document_id: citation.document_id ?? undefined,
                revision_id: citation.revision_id ?? undefined,
                chunk_id: citation.chunk_id ?? undefined,
                chunk_index: citation.chunk_index ?? undefined,
                page_number: citation.page_number ?? undefined,
            });
        }
    }
    return citations;
}

/**
 * The demo's saved result. It reflects only accepted artifacts: participant
 * mandates, committed citations, recorded conflicts/alignment, and the real
 * closing summary. Archive is a separate optional list action.
 */
export function DemoOutcomePanel({
    meeting,
    disagreements,
    consensus,
    summary,
    archived,
}: DemoOutcomePanelProps) {
    const outcomeRef = useAnchorRef("room.outcome");
    const participants = meeting.participants ?? [];
    const citations = messageCitations(meeting.messages ?? []);
    const openConflicts = disagreements.filter(
        (item) => item.status === "open"
    ).length;

    return (
        <section
            ref={outcomeRef}
            data-testid="demo-outcome"
            aria-labelledby="demo-outcome-heading"
            className="mt-6 space-y-4 border-t border-separator pt-5"
        >
            <header>
                <p className="type-meta font-medium text-action">Saved result</p>
                <h2
                    id="demo-outcome-heading"
                    className="mt-1 type-section-title text-ink"
                >
                    What this discussion produced
                </h2>
                <p className="mt-1 type-meta text-ink-secondary">
                    A research checklist, not a buy/sell recommendation or
                    investment approval.
                </p>
            </header>

            {participants.length > 0 ? (
                <Card className="p-4">
                    <h3 className="type-control font-semibold text-ink">
                        Different mandates
                    </h3>
                    <p className="mt-1 type-meta text-ink-secondary">
                        Each participant brought a distinct scope to the same
                        record.
                    </p>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                        {participants.map((participant) => (
                            <li
                                key={participant.id}
                                className="flex min-w-0 items-center gap-2 rounded-control border border-separator bg-surface-raised/50 p-2"
                            >
                                <ParticipantMark
                                    participant={participant}
                                    size="sm"
                                />
                                <span className="min-w-0">
                                    <span className="block truncate type-control text-ink">
                                        {participant.name}
                                    </span>
                                    <span className="block truncate type-meta text-ink-muted">
                                        {participant.role}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </Card>
            ) : null}

            <Card className="p-4">
                <h3 className="type-control font-semibold text-ink">
                    Inspectable evidence
                </h3>
                <p className="mt-1 type-meta text-ink-secondary">
                    Open a source without leaving the outcome.
                </p>
                {citations.length > 0 ? (
                    <CitationsBlock
                        citations={citations}
                        renderPreviewAction={(citation) => (
                            <EvidenceCitationTrigger citation={citation} />
                        )}
                    />
                ) : (
                    <p className="mt-2 type-meta text-ink-muted">
                        The recorded replies carry no citations in this package.
                    </p>
                )}
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
                <Card className="p-4">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="type-control font-semibold text-ink">
                            Conflicts
                        </h3>
                        <Badge variant="secondary" className="text-xs">
                            {openConflicts > 0
                                ? `${openConflicts} retained`
                                : "Resolved"}
                        </Badge>
                    </div>
                    {disagreements.length > 0 ? (
                        <ul className="mt-3 space-y-3">
                            {disagreements.map((item) => (
                                <li key={item.id} className="space-y-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="type-control font-medium text-ink">
                                            {item.topic}
                                        </p>
                                        <Badge
                                            variant="secondary"
                                            className="shrink-0 text-xs capitalize"
                                        >
                                            {item.status}
                                        </Badge>
                                    </div>
                                    <p className="type-meta text-ink-secondary">
                                        {item.reasoning}
                                    </p>
                                    <p className="type-meta text-ink-muted">
                                        Challenging {item.target_name}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-2 type-meta text-ink-muted">
                            No formal disagreement was recorded.
                        </p>
                    )}
                </Card>

                <Card className="p-4">
                    <h3 className="type-control font-semibold text-ink">
                        Alignment
                    </h3>
                    {consensus.length > 0 ? (
                        <ul className="mt-3 space-y-3">
                            {consensus.map((item) => (
                                <li key={item.id} className="space-y-1">
                                    <p className="type-control font-medium text-ink">
                                        {item.topic}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(item.participants as string[]).map(
                                            (name, index) => (
                                                <Badge
                                                    key={`${name}-${index}`}
                                                    variant="secondary"
                                                    className="text-xs"
                                                >
                                                    {name}
                                                </Badge>
                                            )
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-2 type-meta text-ink-muted">
                            No formal alignment was recorded.
                        </p>
                    )}
                </Card>
            </div>

            {summary ? (
                <Card className="p-4" data-testid="demo-outcome-summary">
                    <h3 className="type-control font-semibold text-ink">
                        Research checklist
                    </h3>
                    <div className="m-prose mt-2 type-control text-ink">
                        <p className="whitespace-pre-wrap">{summary}</p>
                    </div>
                </Card>
            ) : null}

            <Card className="p-4">
                <h3 className="type-control font-semibold text-ink">
                    Next destinations
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                        href="/demo/roster"
                        className="m-control rounded-full border border-separator px-3 py-1 type-meta text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        Compare personas
                    </Link>
                    <Link
                        href="/demo/knowledge-stacks"
                        className="m-control rounded-full border border-separator px-3 py-1 type-meta text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        Inspect knowledge stacks
                    </Link>
                    <Link
                        href="/demo/meetings"
                        className="m-control rounded-full border border-separator px-3 py-1 type-meta text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        Open the meetings list
                    </Link>
                </div>
                <p className="mt-3 type-meta text-ink-muted">
                    {archived
                        ? "This record is archived. "
                        : "Archiving is optional; it moves the closed record out of active work. "}
                    Changes made in this browser stay here until the demo is
                    restarted.
                </p>
            </Card>
        </section>
    );
}
