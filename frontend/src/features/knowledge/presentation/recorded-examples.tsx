"use client";

/**
 * Recorded examples linked to approved prepared inputs (spec-25).
 *
 * The mapping is data-only and resolves through the recorded package's claim
 * citations. It never represents a retrieval performed against practice edits.
 */
import type { ReactNode } from "react";
import { BookOpenCheck } from "lucide-react";

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

export interface RecordedExampleView {
    claimId: string;
    sampleId: string;
    sampleFileName: string;
    text: string;
    locator?: string | null;
    excerpt?: string | null;
    sourceTitle?: string | null;
}

export interface RecordedExamplesViewProps {
    examples: RecordedExampleView[];
    renderPreviewAction?: (example: RecordedExampleView) => ReactNode;
}

export function RecordedExamplesView({
    examples,
    renderPreviewAction,
}: RecordedExamplesViewProps) {
    if (examples.length === 0) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <BookOpenCheck className="size-4 text-action" />
                    Recorded example using the demo input
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="type-body text-ink-secondary">
                    These citations come from the recorded HDFC meeting and
                    explicitly reference the same demo asset. They are not a
                    fresh retrieval against your browser edits or a claim that
                    the document was parsed or indexed.
                </p>
                <ul className="space-y-3">
                    {examples.map((example) => (
                        <li
                            key={`${example.sampleId}:${example.claimId}`}
                            className="rounded-control border border-separator bg-canvas/50 p-3"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="type-meta font-medium text-action">
                                    {example.sampleFileName}
                                </span>
                                {renderPreviewAction?.(example) ?? null}
                            </div>
                            <p className="mt-2 type-body text-ink-secondary">
                                {example.text}
                            </p>
                            {example.excerpt ? (
                                <p className="mt-1 type-meta text-ink-muted">
                                    Recorded demo excerpt: “{example.excerpt}”
                                </p>
                            ) : null}
                            <p className="mt-1 type-meta text-ink-muted">
                                Claim {example.claimId}
                                {example.locator ? ` · ${example.locator}` : ""}
                                {example.sourceTitle
                                    ? ` · ${example.sourceTitle}`
                                    : ""}
                            </p>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
}
