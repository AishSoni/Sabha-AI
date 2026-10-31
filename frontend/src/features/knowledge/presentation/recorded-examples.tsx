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
        <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                    <BookOpenCheck className="h-4 w-4 text-cyan-400" />
                    Recorded example using the prepared input
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm leading-6 text-zinc-400">
                    These citations come from the recorded HDFC meeting and
                    explicitly reference the same prepared asset. They are not a
                    fresh retrieval against your practice edits or a claim that
                    the practice document was parsed or indexed.
                </p>
                <ul className="space-y-3">
                    {examples.map((example) => (
                        <li
                            key={`${example.sampleId}:${example.claimId}`}
                            className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-medium text-cyan-300">
                                    {example.sampleFileName}
                                </span>
                                {renderPreviewAction?.(example) ?? null}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-300">
                                {example.text}
                            </p>
                            {example.excerpt ? (
                                <p className="mt-1 text-xs leading-5 text-zinc-500">
                                    Recorded excerpt: “{example.excerpt}”
                                </p>
                            ) : null}
                            <p className="mt-1 text-xs text-zinc-500">
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
