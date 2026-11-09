"use client";

import {
    BookOpen,
    Check,
    FileSearch,
    MessagesSquare,
    Settings2,
    Sparkles,
    Users,
} from "lucide-react";
import {
    DirectorMark,
    ParticipantMark,
} from "@/components/identity/participant-mark";
import type { IntroVisualId } from "./steps";

const PARTICIPANTS = [
    {
        id: "demo-intro-mira",
        name: "Mira",
        role: "Credit Analyst",
        color: "#6366f1",
    },
    {
        id: "demo-intro-arjun",
        name: "Arjun",
        role: "Downside Reviewer",
        color: "#f59e0b",
    },
    {
        id: "demo-intro-leena",
        name: "Leena",
        role: "Portfolio Analyst",
        color: "#10b981",
    },
] as const;

function ConstellationVisual() {
    return (
        <div className="relative mx-auto aspect-[4/3] w-full max-w-md">
            <svg
                viewBox="0 0 400 300"
                className="absolute inset-0 h-full w-full text-action/35"
                aria-hidden="true"
            >
                <path
                    d="M200 150 L80 70 M200 150 L320 70 M200 150 L80 230 M200 150 L320 230"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeDasharray="3 5"
                />
                <circle cx="200" cy="150" r="54" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                <circle cx="200" cy="150" r="94" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.25" />
            </svg>
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-center">
                <DirectorMark size="lg" />
                <span className="type-meta font-medium text-ink">You direct</span>
            </div>
            {PARTICIPANTS.map((participant, index) => {
                const positions = [
                    "left-[12%] top-[12%]",
                    "right-[12%] top-[12%]",
                    "bottom-[10%] left-1/2 -translate-x-1/2",
                ];
                return (
                    <div
                        key={participant.id}
                        className={`absolute flex items-center gap-2 rounded-control border border-separator bg-surface px-2.5 py-2 shadow-sm ${positions[index]}`}
                    >
                        <ParticipantMark
                            participant={participant}
                            size="sm"
                        />
                        <div className="min-w-0">
                            <p className="type-meta font-semibold text-ink">
                                {participant.name}
                            </p>
                            <p className="type-meta text-ink-muted">
                                {participant.role}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

const RECORD_ROWS = [
    {
        label: "Argument",
        detail: "The terms and issuer record",
        tone: "text-action",
    },
    {
        label: "Disagreement",
        detail: "AAA is an opinion, not a guarantee",
        tone: "text-warning",
    },
    {
        label: "Source",
        detail: "Shared fact sheet, dated July 2020",
        tone: "text-success",
    },
    {
        label: "Outcome",
        detail: "A bounded research checklist",
        tone: "text-ink",
    },
] as const;

function RecordVisual() {
    return (
        <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
                <p className="type-meta font-semibold uppercase tracking-wide text-ink-secondary">
                    Meeting record
                </p>
                <span className="rounded-full border border-success/40 bg-success-soft px-2 py-0.5 type-meta font-medium text-success">
                    Inspectable
                </span>
            </div>
            {RECORD_ROWS.map((row) => (
                <div
                    key={row.label}
                    className="material-raised flex items-center gap-3 rounded-control px-3 py-2.5"
                >
                    <span className={`type-meta font-semibold ${row.tone}`}>
                        {row.label}
                    </span>
                    <span className="type-meta text-ink-secondary">
                        {row.detail}
                    </span>
                </div>
            ))}
            <p className="type-meta text-ink-muted">
                Nothing here is generated while you read it. This is the
                recorded meeting record.
            </p>
        </div>
    );
}

function TermSheetVisual() {
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="type-meta font-semibold uppercase tracking-wide text-ink-muted">
                        Historical example
                    </p>
                    <p className="type-item-title mt-1">
                        HDFC Ltd 7.87% 2022 Debenture
                    </p>
                </div>
                <span className="rounded-full border border-warning/40 bg-warning-soft px-2 py-0.5 type-meta font-medium text-warning">
                    Not investment advice
                </span>
            </div>
            <dl className="grid gap-2 sm:grid-cols-2">
                {[
                    ["Coupon", "7.87%"],
                    ["Maturity", "2022"],
                    ["ISIN", "INE001A07RW5"],
                    ["Rating", "CRISIL AAA / Stable (July 2020)"],
                ].map(([term, value]) => (
                    <div
                        key={term}
                        className="material-raised rounded-control px-3 py-2"
                    >
                        <dt className="type-meta text-ink-muted">{term}</dt>
                        <dd className="type-control font-medium text-ink">
                            {value}
                        </dd>
                    </div>
                ))}
            </dl>
            <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-control border border-success/40 bg-success-soft p-3">
                    <p className="type-meta font-semibold uppercase tracking-wide text-success">
                        Known
                    </p>
                    <p className="mt-1 type-meta text-ink-secondary">
                        Terms, rating and issuer context from the dated fact
                        sheet.
                    </p>
                </div>
                <div className="rounded-control border border-warning/40 bg-warning-soft p-3">
                    <p className="type-meta font-semibold uppercase tracking-wide text-warning">
                        Unknown
                    </p>
                    <p className="mt-1 type-meta text-ink-secondary">
                        Current price, executable yield and secondary
                        liquidity.
                    </p>
                </div>
            </div>
            <p className="type-meta text-ink-muted">
                Chosen because the record is dated and bounded, not because it
                is a recommendation. Information as of 31 July 2020.
            </p>
        </div>
    );
}

const TRY_ITEMS = [
    {
        icon: FileSearch,
        label: "Open the shared fact sheet",
    },
    {
        icon: MessagesSquare,
        label: "Choose who speaks next",
    },
    {
        icon: Sparkles,
        label: "Read a disagreement and its source",
    },
    {
        icon: Check,
        label: "Send a follow-up and close with a checklist",
    },
] as const;

function ChecklistVisual() {
    return (
        <div className="space-y-4">
            <ul className="space-y-2">
                {TRY_ITEMS.map((item, index) => (
                    <li
                        key={item.label}
                        className="material-raised flex items-center gap-3 rounded-control px-3 py-2.5"
                    >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft type-meta font-semibold text-action">
                            {index + 1}
                        </span>
                        <item.icon
                            className="size-4 shrink-0 text-action"
                            aria-hidden="true"
                        />
                        <span className="type-control text-ink">
                            {item.label}
                        </span>
                    </li>
                ))}
            </ul>
            <div className="rounded-control border border-separator bg-surface-raised p-3">
                <p className="type-meta font-semibold uppercase tracking-wide text-ink-muted">
                    Then inspect the wiring
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-separator bg-surface px-2.5 py-1 type-meta text-ink-secondary">
                        <Users className="size-3.5" aria-hidden="true" />
                        Personas
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-separator bg-surface px-2.5 py-1 type-meta text-ink-secondary">
                        <BookOpen className="size-3.5" aria-hidden="true" />
                        Knowledge
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-separator bg-surface px-2.5 py-1 type-meta text-ink-secondary">
                        <Settings2 className="size-3.5" aria-hidden="true" />
                        Settings
                    </span>
                </div>
            </div>
        </div>
    );
}

export function IntroVisual({ visual }: { visual: IntroVisualId }) {
    if (visual === "constellation") return <ConstellationVisual />;
    if (visual === "record") return <RecordVisual />;
    if (visual === "term-sheet") return <TermSheetVisual />;
    return <ChecklistVisual />;
}
