'use client';

import { useState } from 'react';
import { useMeetingStore } from '@/stores/meetingStore';
import { useSettingsStore } from '@/stores/settings-store';
import { api } from '@/lib/api';
import { ClosingPanel, type ClosingView } from '@/features/meetings';
import { deriveSummariesFromMessages } from '@/lib/summary-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    Scroll,
    Loader2,
    RefreshCw,
    AlertTriangle,
    Clock,
    ListOrdered,
    CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function SummaryTab() {
    const { currentMeeting, setCurrentMeeting } = useMeetingStore();
    const systemAI = useSettingsStore((state) => state.systemAI);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);

    if (!currentMeeting) {
        return (
            <div className="flex items-center justify-center h-full text-zinc-500">
                No meeting selected
            </div>
        );
    }

    const isMeetingEnded = currentMeeting.status === 'ended';
    // The summary list derives from persisted system messages — reload-safe
    // and free of client-side mock data.
    const summaries = deriveSummariesFromMessages(currentMeeting.messages);
    // One shared chronological numbering: interims and the final ending
    // summary both advance the sequence.
    const nextSummaryNumber = summaries.length + 1;
    const meetingId = currentMeeting.id;

    const handleGenerateSummary = async () => {
        setIsGenerating(true);
        setGenerateError(null);
        try {
            const meetingIdAtStart = useMeetingStore.getState().currentMeeting?.id;
            const generationSettings =
                useSettingsStore.getState().composeGenerationSettings() ?? undefined;
            await api.generateSummary(meetingIdAtStart ?? meetingId, generationSettings);
            // The new summary lives as a persisted system message: refetch the
            // meeting so the derived list shows it (never recreate it locally).
            const updatedMeeting = await api.getMeeting(meetingIdAtStart ?? meetingId);
            // Op-scope: a refetch for a meeting the user already navigated
            // away from must not overwrite the presented meeting.
            const presentedId = useMeetingStore.getState().currentMeeting?.id;
            if (presentedId != null && presentedId === (updatedMeeting as { id?: string }).id) {
                setCurrentMeeting(updatedMeeting);
            }
        } catch (err) {
            setGenerateError((err as Error).message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleClosingSettled = async (view: ClosingView) => {
        // Closing committed canonical messages and the lifecycle status. The
        // old store is still the room's presentation cache until it migrates,
        // so refresh it from the server (never invent a local final summary).
        try {
            const updatedMeeting = await api.getMeeting(view.meeting_id);
            const presentedId = useMeetingStore.getState().currentMeeting?.id;
            if (presentedId != null && presentedId === (updatedMeeting as { id?: string }).id) {
                setCurrentMeeting(updatedMeeting);
            }
        } catch (err) {
            console.error('Failed to refresh the ended meeting:', err);
        }
    };

    return (
        <ScrollArea className="h-full p-4">
            <div className="max-w-3xl mx-auto space-y-6">
                {/* Meeting Ended Banner */}
                {isMeetingEnded && (
                    <Card className="bg-indigo-950/30 border-indigo-800/50 p-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-6 h-6 text-indigo-400" />
                            <div>
                                <h4 className="font-medium text-white">Meeting Ended</h4>
                                <p className="text-sm text-zinc-400">
                                    This meeting has concluded. The chat is now read-only.
                                </p>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Header */}
                <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-1">Meeting Summary</h3>
                    <p className="text-sm text-zinc-400">
                        Generate numbered summaries at any point during the meeting.
                    </p>
                </div>

                {/* Generate Summary Button */}
                <Card className="bg-zinc-900/50 border-zinc-800 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-white mb-1">Generate Summary</h4>
                            <p className="text-xs text-zinc-500">
                                Create a numbered summary of the discussion so far
                            </p>
                        </div>
                        <Button
                            onClick={handleGenerateSummary}
                            disabled={isGenerating || isMeetingEnded}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Generate Summary #{nextSummaryNumber}
                                </>
                            )}
                        </Button>
                    </div>
                </Card>

                {/* Generation failure banner */}
                {generateError && (
                    <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg flex items-center gap-2 text-red-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm flex-1">{generateError}</span>
                        <button onClick={() => setGenerateError(null)} className="text-xs hover:underline">
                            Dismiss
                        </button>
                    </div>
                )}

                {/* Summary History */}
                <div>
                    <h4 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
                        <ListOrdered className="w-4 h-4" />
                        Summary History
                    </h4>

                    {summaries.length === 0 ? (
                        <div className="text-center py-12 text-zinc-500">
                            <Scroll className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <h3 className="text-lg font-medium text-zinc-400 mb-1">No Summaries Yet</h3>
                            <p className="text-sm">
                                Generate your first summary to capture the discussion progress.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {summaries.map((summary) => (
                                <SummaryCard key={summary.id} summary={summary} />
                            ))}
                        </div>
                    )}
                </div>

                <Separator className="bg-zinc-800" />

                <ClosingPanel
                    meetingId={meetingId}
                    meetingStatus={currentMeeting.status}
                    summarySettings={
                        systemAI.provider && systemAI.model
                            ? {
                                  provider: systemAI.provider,
                                  model: systemAI.model,
                                  temperature: systemAI.temperature,
                                  maxTokens: systemAI.maxTokens,
                              }
                            : undefined
                    }
                    onSettled={handleClosingSettled}
                />
            </div>
        </ScrollArea>
    );
}

interface SummaryCardProps {
    summary: {
        id: string;
        number: number;
        content: string;
        createdAt: string;
        isFinal: boolean;
    };
}

function SummaryCard({ summary }: SummaryCardProps) {
    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <Card className={cn(
            'border p-4',
            summary.isFinal
                ? 'bg-indigo-950/30 border-indigo-800/50'
                : 'bg-zinc-900/50 border-zinc-800'
        )}>
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Badge
                        variant="secondary"
                        className={cn(
                            'text-xs',
                            summary.isFinal
                                ? 'bg-indigo-900/50 text-indigo-400'
                                : 'bg-zinc-800 text-zinc-400'
                        )}
                    >
                        #{summary.number}
                    </Badge>
                    {summary.isFinal && (
                        <Badge variant="secondary" className="text-xs bg-indigo-900/50 text-indigo-400">
                            Final
                        </Badge>
                    )}
                </div>
                <span className="text-xs text-zinc-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(summary.createdAt)}
                </span>
            </div>
            <div className="prose prose-sm prose-invert max-w-none prose-headings:text-base prose-headings:mb-2 prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                <div
                    className="text-sm text-zinc-300 whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{
                        __html: summary.content
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/^## (.*$)/gm, '<h3 class="text-white font-semibold">$1</h3>')
                            .replace(/^- (.*$)/gm, '<li>$1</li>')
                            .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
                    }}
                />
            </div>
        </Card>
    );
}
