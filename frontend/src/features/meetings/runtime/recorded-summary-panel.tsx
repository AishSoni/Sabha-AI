"use client";

/**
 * Recorded summary inspection (spec-26).
 *
 * This is a replay-only slot. It reads a saved system message from the
 * pinned package and never imports provider settings, generation mutations,
 * or usage/accounting state.
 */
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MeetingWithParticipants } from "../api/decoders";
import { useMeetingsRuntime } from "../runtime/context";

export function RecordedSummaryPanel({
    meeting,
}: {
    meeting: MeetingWithParticipants;
}) {
    const runtime = useMeetingsRuntime();
    const replay = runtime.replay;
    const summaryChapter = replay?.chapters.find(
        (chapter) => chapter.tab === "summary"
    );
    const summaryId = summaryChapter?.summary_message_id ?? null;
    const systemMessages = (meeting.messages ?? []).filter(
        (message) => message.sender_type === "system"
    );
    const summary = summaryId
        ? systemMessages.find((message) => message.id === summaryId) ?? null
        : systemMessages[systemMessages.length - 1] ?? null;

    return (
        <ScrollArea className="h-full p-4">
            <div className="mx-auto max-w-3xl space-y-4">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="type-section-title">Recorded summary</h3>
                        <Badge variant="secondary">Inspection only</Badge>
                    </div>
                    {replay ? (
                        <p className="mt-1 type-meta text-ink-muted">
                            Recorded scope: as of {replay.asOf} · package{" "}
                            {replay.packageVersion}
                        </p>
                    ) : null}
                </div>

                {summary ? (
                    <Card className="p-4">
                        <div className="mb-2 flex items-center gap-2">
                            <Badge variant="secondary">Recorded system summary</Badge>
                            <span className="type-meta text-ink-muted">
                                {summary.created_at}
                            </span>
                        </div>
                        <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-headings:text-ink prose-p:text-ink-secondary prose-li:text-ink-secondary">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {summary.content}
                            </ReactMarkdown>
                        </div>
                    </Card>
                ) : (
                    <p className="type-body text-ink-muted">
                        This recorded snapshot does not include an approved
                        system summary.
                    </p>
                )}
            </div>
        </ScrollArea>
    );
}
