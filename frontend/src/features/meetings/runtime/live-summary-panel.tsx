"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RateLimitedButton } from "@/components/ui/rate-limited-button";
import { useProvidersEnvironment, useSettingsStore } from "@/features/settings";
import { formatCost, formatRelativeTime } from "@/lib/utils";
import { Loader2, Scroll } from "lucide-react";
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
                        <h3 className="text-lg font-semibold text-white">Meeting Summary</h3>
                        <p className="text-sm text-zinc-400">
                            Summaries are generated on demand and saved to the transcript.
                        </p>
                    </div>
                    <Button
                        onClick={generate}
                        disabled={
                            generateSummary.isPending || (meeting.messages ?? []).length === 0
                        }
                        className="bg-indigo-600 hover:bg-indigo-700 shrink-0"
                    >
                        {generateSummary.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Scroll className="w-4 h-4 mr-2" />
                        )}
                        Generate summary
                    </Button>
                </div>

                {generateSummary.isError && (
                    <div className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
                        {(generateSummary.error as Error).message}
                    </div>
                )}

                {summaries.length === 0 ? (
                    <p className="text-sm text-zinc-500">No summaries yet.</p>
                ) : (
                    summaries.map((summary) => (
                        <Card key={summary.id} className="p-4 bg-zinc-900/50 border-zinc-800">
                            <div className="flex items-center gap-2 mb-2">
                                <Badge variant="secondary" className="bg-indigo-900/40 text-indigo-300">
                                    System AI
                                </Badge>
                                <span className="text-xs text-zinc-500">
                                    {formatRelativeTime(summary.created_at)}
                                </span>
                                {summary.estimated_cost > 0 && (
                                    <span className="text-xs text-zinc-500">
                                        {formatCost(summary.estimated_cost)}
                                    </span>
                                )}
                            </div>
                            <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1">
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
