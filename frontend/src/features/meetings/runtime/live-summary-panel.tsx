"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProvidersEnvironment, useSettingsStore } from "@/features/settings";
import { formatCost, formatRelativeTime } from "@/lib/utils";
import { Scroll } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MeetingWithParticipants } from "../api/decoders";
import { useGenerateSummary } from "../api/mutations";

/**
 * Live-only summary composition (spec-14).
 *
 * The canonical summary screen reads provider environment and the BYOK vault.
 * It is supplied as a runtime slot so the recorded replay graph never imports
 * those live credential modules.
 */
export function LiveSummaryPanel({
    meeting,
}: {
    meeting: MeetingWithParticipants;
}) {
    const providersQuery = useProvidersEnvironment();
    const getProviderApiKey = useSettingsStore((state) => state.getProviderApiKey);
    const generateSummary = useGenerateSummary();
    const summaries = (meeting.messages ?? [])
        .filter((message) => message.sender_type === "system")
        .slice()
        .reverse();

    const systemAiProvider =
        providersQuery.data?.systemAI.provider ||
        providersQuery.data?.environment.defaultProvider ||
        "";
    const providerKey = systemAiProvider ? getProviderApiKey(systemAiProvider) : undefined;

    const generate = () => {
        // Provider/model/temperature belong to server-owned System AI. The
        // browser contributes only its transient BYOK key, when it has one.
        void generateSummary.mutateAsync({
            meetingId: meeting.id,
            settings: providerKey ? { apiKey: providerKey } : undefined,
        });
    };

    return (
        <ScrollArea className="h-full p-4">
            <div className="max-w-3xl mx-auto space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="type-section-title">Meeting Summary</h3>
                        <p className="type-body text-ink-secondary">
                            Summaries are generated on demand and saved to the transcript.
                        </p>
                    </div>
                    <Button
                        onClick={generate}
                        busy={generateSummary.isPending}
                        busyLabel="Generating summary"
                        disabled={(meeting.messages ?? []).length === 0}
                        className="shrink-0"
                    >
                        <Scroll className="mr-2 size-4" />
                        Generate summary
                    </Button>
                </div>

                {generateSummary.isError && (
                    <div role="alert" className="rounded-control border border-danger/40 bg-danger-soft p-3 type-body text-danger">
                        {(generateSummary.error as Error).message}
                    </div>
                )}

                {summaries.length === 0 ? (
                    <p className="type-body text-ink-muted">No summaries yet.</p>
                ) : (
                    summaries.map((summary) => (
                        <Card key={summary.id} className="p-4">
                            <div className="mb-2 flex items-center gap-2">
                                <Badge variant="secondary">System AI</Badge>
                                <span className="type-meta text-ink-muted">
                                    {formatRelativeTime(summary.created_at)}
                                </span>
                                {summary.estimated_cost > 0 && (
                                    <span className="type-meta type-tabular text-ink-muted">
                                        {formatCost(summary.estimated_cost)}
                                    </span>
                                )}
                            </div>
                            <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-headings:text-ink prose-p:text-ink-secondary prose-li:text-ink-secondary">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {summary.content}
                                </ReactMarkdown>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </ScrollArea>
    );
}
