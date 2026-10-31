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
                        <h3 className="text-lg font-semibold text-white">
                            Recorded summary
                        </h3>
                        <Badge
                            variant="secondary"
                            className="bg-indigo-900/40 text-indigo-300"
                        >
                            Inspection only
                        </Badge>
                    </div>
                    <p className="mt-1 text-sm text-zinc-400">
                        This summary was saved with the recorded package and is
                        shown as historical evidence. It is not generated now,
                        and viewing it does not create a new meeting result.
                    </p>
                    {replay ? (
                        <p className="mt-1 text-xs text-zinc-500">
                            Recorded scope: as of {replay.asOf} · package{" "}
                            {replay.packageVersion}
                        </p>
                    ) : null}
                </div>

                {summary ? (
                    <Card className="border-zinc-800 bg-zinc-900/50 p-4">
                        <div className="mb-2 flex items-center gap-2">
                            <Badge
                                variant="secondary"
                                className="bg-indigo-900/40 text-indigo-300"
                            >
                                Recorded system summary
                            </Badge>
                            <span className="text-xs text-zinc-500">
                                {summary.created_at}
                            </span>
                        </div>
                        <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {summary.content}
                            </ReactMarkdown>
                        </div>
                    </Card>
                ) : (
                    <p className="text-sm text-zinc-500">
                        This recorded snapshot does not include an approved
                        system summary.
                    </p>
                )}
            </div>
        </ScrollArea>
    );
}
