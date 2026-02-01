'use client';

import { useState } from 'react';
import { useMeetingStore } from '@/stores/meetingStore';
import { api, EndMeetingVote, EndMeetingResponse } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    Scroll,
    Loader2,
    RefreshCw,
    LogOut,
    Vote,
    AlertTriangle,
    Clock,
    ListOrdered,
    CheckCircle2,
    XCircle,
    Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Mock summaries for demonstration (will be replaced with real summaries from backend)
const MOCK_SUMMARIES = [
    {
        id: '1',
        number: 1,
        content: `## Summary #1 - Initial Discussion

**Key Points Discussed:**
1. The Investor raised concerns about market positioning
2. The CTO proposed a phased technical approach
3. Initial consensus reached on MVP scope

**Open Items:**
- Need to validate pricing model
- Technical feasibility study pending`,
        createdAt: '2026-01-31T14:30:00Z',
        isFinal: false,
    },
];

export function SummaryTab() {
    const { currentMeeting, setCurrentMeeting } = useMeetingStore();
    const [isGenerating, setIsGenerating] = useState(false);
    const [summaries, setSummaries] = useState(MOCK_SUMMARIES);
    const [showEndMeetingConfirm, setShowEndMeetingConfirm] = useState(false);
    const [isEndingMeeting, setIsEndingMeeting] = useState(false);
    const [endMeetingResult, setEndMeetingResult] = useState<EndMeetingResponse | null>(null);

    if (!currentMeeting) {
        return (
            <div className="flex items-center justify-center h-full text-zinc-500">
                No meeting selected
            </div>
        );
    }

    const isMeetingEnded = currentMeeting.status === 'ended';

    const handleGenerateSummary = async () => {
        setIsGenerating(true);
        // TODO: Call backend API to generate summary
        setTimeout(() => {
            const newSummary = {
                id: String(summaries.length + 1),
                number: summaries.length + 1,
                content: `## Summary #${summaries.length + 1} - Generated at ${new Date().toLocaleTimeString()}

**Key Points:**
1. Discussion point from recent messages
2. Areas of agreement and disagreement
3. Action items identified

**Next Steps:**
- Continue discussion on open items`,
                createdAt: new Date().toISOString(),
                isFinal: false,
            };
            setSummaries([...summaries, newSummary]);
            setIsGenerating(false);
        }, 2000);
    };

    const handleEndMeeting = async (forceEnd: boolean) => {
        setIsEndingMeeting(true);
        setEndMeetingResult(null);

        try {
            const response = await api.endMeeting(currentMeeting.id, forceEnd);
            setEndMeetingResult(response);

            if (response.success) {
                // Refresh meeting data to get updated status and messages
                const updatedMeeting = await api.getMeeting(currentMeeting.id);
                setCurrentMeeting(updatedMeeting);

                // Add executive summary to local summaries
                if (response.summary) {
                    setSummaries([...summaries, {
                        id: 'final',
                        number: summaries.length + 1,
                        content: response.summary,
                        createdAt: new Date().toISOString(),
                        isFinal: true,
                    }]);
                }
            }

            setShowEndMeetingConfirm(false);
        } catch (err) {
            console.error('Failed to end meeting:', err);
            setEndMeetingResult({
                success: false,
                votes: [],
                summary: null,
                message: 'Failed to end meeting: ' + (err as Error).message,
            });
        } finally {
            setIsEndingMeeting(false);
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
                                    Generate Summary #{summaries.length + 1}
                                </>
                            )}
                        </Button>
                    </div>
                </Card>

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

                {/* Vote Results (if available) */}
                {endMeetingResult && endMeetingResult.votes.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Vote Results
                        </h4>

                        <Card className={cn(
                            "p-4 border",
                            endMeetingResult.success
                                ? "bg-green-950/30 border-green-800/50"
                                : "bg-amber-950/30 border-amber-800/50"
                        )}>
                            <div className="mb-3 text-sm font-medium">
                                {endMeetingResult.message}
                            </div>
                            <div className="space-y-2">
                                {endMeetingResult.votes.map((vote) => (
                                    <VoteCard key={vote.participant_id} vote={vote} />
                                ))}
                            </div>
                        </Card>
                    </div>
                )}

                {/* End Meeting Section */}
                {!isMeetingEnded && (
                    <div>
                        <h4 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
                            <LogOut className="w-4 h-4" />
                            End Meeting
                        </h4>

                        {!showEndMeetingConfirm ? (
                            <Card className="bg-zinc-900/50 border-zinc-800 p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="font-medium text-white mb-1">Conclude Meeting</h4>
                                        <p className="text-xs text-zinc-500">
                                            End the meeting and generate a final summary
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        onClick={() => setShowEndMeetingConfirm(true)}
                                        className="border-red-800 text-red-400 hover:bg-red-900/20"
                                    >
                                        <LogOut className="w-4 h-4 mr-2" />
                                        End Meeting
                                    </Button>
                                </div>
                            </Card>
                        ) : (
                            <Card className="bg-red-950/30 border-red-800/50 p-4">
                                <div className="flex items-start gap-3 mb-4">
                                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-medium text-white mb-1">End this meeting?</h4>
                                        <p className="text-sm text-zinc-400">
                                            Choose how you want to end the meeting:
                                        </p>
                                    </div>
                                </div>

                                {isEndingMeeting ? (
                                    <div className="flex items-center justify-center py-6">
                                        <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mr-2" />
                                        <span className="text-zinc-400">Processing...</span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            {/* Vote to End */}
                                            <Button
                                                variant="outline"
                                                onClick={() => handleEndMeeting(false)}
                                                className="h-auto py-3 flex-col items-center border-zinc-700 hover:bg-zinc-800"
                                            >
                                                <Vote className="w-5 h-5 mb-1 text-amber-400" />
                                                <span className="font-medium">Vote to End</span>
                                                <span className="text-xs text-zinc-500">Ask participants</span>
                                            </Button>

                                            {/* Force End */}
                                            <Button
                                                variant="outline"
                                                onClick={() => handleEndMeeting(true)}
                                                className="h-auto py-3 flex-col items-center border-red-800 hover:bg-red-900/20 text-red-400"
                                            >
                                                <LogOut className="w-5 h-5 mb-1" />
                                                <span className="font-medium">Force End</span>
                                                <span className="text-xs text-zinc-500">End immediately</span>
                                            </Button>
                                        </div>

                                        <Button
                                            variant="ghost"
                                            onClick={() => setShowEndMeetingConfirm(false)}
                                            className="w-full text-zinc-400 hover:text-white"
                                        >
                                            Cancel
                                        </Button>
                                    </>
                                )}
                            </Card>
                        )}
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}

interface VoteCardProps {
    vote: EndMeetingVote;
}

function VoteCard({ vote }: VoteCardProps) {
    return (
        <div className="flex items-start gap-2 p-2 bg-zinc-900/50 rounded-lg">
            {vote.vote ? (
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
            ) : (
                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{vote.participant_name}</span>
                    <Badge variant="secondary" className={cn(
                        "text-xs",
                        vote.vote ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
                    )}>
                        {vote.vote ? 'Yes' : 'No'}
                    </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">{vote.reason}</p>
            </div>
        </div>
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
