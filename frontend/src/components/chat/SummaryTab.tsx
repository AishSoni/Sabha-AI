'use client';

import { useMemo, useState } from 'react';
import { useMeetingStore } from '@/stores/meetingStore';
import { api, isDemoSessionFor, EndMeetingVote, EndMeetingResponse } from '@/lib/api';
import { postDemoJourneyProgress } from '@/lib/demoGuideApi';
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

export function SummaryTab() {
    const { currentMeeting } = useMeetingStore();
    const loadMeeting = useMeetingStore((s) => s.loadMeeting);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshError, setRefreshError] = useState<string | null>(null);
    const [showEndMeetingConfirm, setShowEndMeetingConfirm] = useState(false);
    const [isEndingMeeting, setIsEndingMeeting] = useState(false);
    const [endMeetingResult, setEndMeetingResult] = useState<EndMeetingResponse | null>(null);
    const [isDemoEnding, setIsDemoEnding] = useState(false);
    const [demoVotes, setDemoVotes] = useState<EndMeetingVote[]>([]);
    const [demoBrief, setDemoBrief] = useState('');
    const [demoEndingError, setDemoEndingError] = useState<string | null>(null);
    const [demoEndingNote, setDemoEndingNote] = useState<string | null>(null);

    // Authoritative summary history: system transcript messages plus the final
    // summary returned by the ending attempt. No locally fabricated summaries.
    const summaries = useMemo(() => {
        if (!currentMeeting) return [];
        const systemEntries = currentMeeting.messages
            .filter((m) => m.sender_type === 'system')
            .map((m, i) => ({
                id: m.id,
                number: i + 1,
                content: m.content,
                createdAt: m.created_at,
                isFinal: false,
            }));
        if (endMeetingResult?.summary) {
            return [
                ...systemEntries,
                {
                    id: 'final',
                    number: systemEntries.length + 1,
                    content: endMeetingResult.summary,
                    createdAt: new Date().toISOString(),
                    isFinal: true,
                },
            ];
        }
        return systemEntries;
    }, [currentMeeting, endMeetingResult]);

    if (!currentMeeting) {
        return (
            <div className="flex items-center justify-center h-full text-zinc-500">
                No meeting selected
            </div>
        );
    }

    const isMeetingEnded = currentMeeting.status === 'ended';
    const isReadOnly = currentMeeting.status === 'ended' || currentMeeting.status === 'archived';
    const canEnd = currentMeeting.status === 'active';
    const isDemoRoom = isDemoSessionFor(currentMeeting.id);

    const handleDemoEndMeeting = async () => {
        const meetingId = currentMeeting.id;
        setIsDemoEnding(true);
        setDemoVotes([]);
        setDemoBrief('');
        setDemoEndingError(null);
        setDemoEndingNote(null);
        setEndMeetingResult(null);

        const controller = new AbortController();
        let terminal: { type: string; data: Record<string, unknown> } | null = null;
        const collectedVotes: EndMeetingVote[] = [];

        try {
            const start = await api.startEndingAttempt({
                meetingId,
                forceEnd: false,
                idempotencyKey: `demo-ending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            });
            if (start.duplicate) {
                setDemoEndingNote(
                    'An ending attempt is already journaled for this walkthrough; replaying it.'
                );
            }

            const outcome = await api.subscribeEndingJournal({
                attemptId: start.attempt_id,
                signal: controller.signal,
                onEvent: (event) => {
                    const data = event.data as Record<string, unknown>;
                    if (event.type === 'vote_recorded') {
                        const vote: EndMeetingVote = {
                            participant_id: String(data.participant_id ?? ''),
                            participant_name: String(data.participant_name ?? ''),
                            vote: Boolean(data.vote),
                            reason: String(data.reason ?? ''),
                        };
                        collectedVotes.push(vote);
                        setDemoVotes([...collectedVotes]);
                    } else if (event.type === 'summary_delta') {
                        setDemoBrief((prev) => prev + String(data.content ?? ''));
                    } else if (event.type === 'ending_completed' || event.type === 'ending_failed') {
                        terminal = { type: event.type, data };
                    }
                },
            });
            if (!terminal && outcome.terminal) {
                terminal = {
                    type: outcome.terminal.type,
                    data: outcome.terminal.data as Record<string, unknown>,
                };
            }

            if (!terminal) {
                // EOF without terminal: reconcile against authoritative state.
                const view = await api.getEndingAttempt(start.attempt_id);
                if (view.outcome === 'completed') {
                    terminal = {
                        type: 'ending_completed',
                        data: { outcome: 'completed', summary: view.summary, votes: view.votes },
                    };
                } else if (view.outcome === 'rejected') {
                    terminal = {
                        type: 'ending_completed',
                        data: { outcome: 'rejected', votes: view.votes },
                    };
                } else {
                    throw new Error('Ending attempt still in progress; retry safely (it is idempotent).');
                }
            }
            const terminalData = terminal.data as Record<string, unknown>;

            if (terminal.type === 'ending_failed') {
                setDemoEndingError(
                    String(
                        terminalData.message ??
                            'Ending attempt failed; the meeting stays active and the attempt can be retried.'
                    )
                );
            } else if (terminalData.outcome === 'completed') {
                setEndMeetingResult({
                    success: true,
                    votes: collectedVotes,
                    summary: typeof terminalData.summary === 'string' ? terminalData.summary : demoBrief || null,
                    message: 'Recorded ending committed to the meeting transcript.',
                });
                setShowEndMeetingConfirm(false);
                await loadMeeting(meetingId);
                try {
                    await postDemoJourneyProgress({
                        actionId: 'end_walkthrough',
                        idempotencyKey: start.attempt_id,
                    });
                } catch {
                    // Journey progression is honest-gated server-side; a conflict
                    // here is surfaced by the guide overlay, not silently faked.
                }
            } else {
                setEndMeetingResult({
                    success: false,
                    votes: collectedVotes,
                    summary: null,
                    message: 'Recorded ballots declined the ending. The meeting stays active.',
                });
            }
        } catch (err) {
            setDemoEndingError(
                (err as Error).message || 'The ending attempt could not be started. Retry safely.'
            );
        } finally {
            setIsDemoEnding(false);
        }
    };

    const handleRefreshState = async () => {
        setIsRefreshing(true);
        setRefreshError(null);
        try {
            // Guarded store reload: stale responses never overwrite a newer
            // selection, and transcript/scoreboard/queue stay consistent.
            await loadMeeting(currentMeeting.id);
        } catch (err) {
            setRefreshError((err as Error).message);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleEndMeeting = async (forceEnd: boolean) => {
        setIsEndingMeeting(true);
        setEndMeetingResult(null);

        try {
            const response = await api.endMeeting(currentMeeting.id, forceEnd);
            setEndMeetingResult(response);

            if (response.success) {
                // Reload through the guarded store path so terminal
                // reconciliation applies instead of a raw transcript swap.
                await loadMeeting(currentMeeting.id);
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
                        Summaries below come from the server transcript and the ending attempt — never generated locally.
                    </p>
                </div>

                {/* Refresh authoritative state */}
                <Card className="bg-zinc-900/50 border-zinc-800 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-white mb-1">Authoritative state</h4>
                            <p className="text-xs text-zinc-500">
                                Reload the transcript and summary state from the server
                            </p>
                            {refreshError && (
                                <p role="alert" className="text-xs text-red-400 mt-1">
                                    Refresh failed: {refreshError}
                                </p>
                            )}
                        </div>
                        <Button
                            onClick={handleRefreshState}
                            disabled={isRefreshing}
                            aria-label="Reload summary state from server"
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {isRefreshing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Refreshing...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Refresh from server
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
                                System transcript entries and the final ending summary will appear here.
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

                {/* End Meeting Section: active meetings only; ended/archived stay read-only. */}
                {isReadOnly ? (
                    <Card className="bg-zinc-900/50 border-zinc-800 p-4">
                        <p className="text-sm text-zinc-400">
                            This meeting is {currentMeeting.status}. The summary view is read-only and will never reopen it.
                        </p>
                    </Card>
                ) : isDemoRoom ? (
                    <div>
                        <h4 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
                            <LogOut className="w-4 h-4" />
                            End Meeting
                        </h4>

                        <Card className="bg-indigo-950/30 border-indigo-800/50 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h4 className="font-medium text-white mb-1">Record the walkthrough ending</h4>
                                    <p className="text-xs text-zinc-500">
                                        The three specialists cast recorded ballots and the recorded brief streams
                                        through the shared ending journal. No live inference runs in the demo.
                                    </p>
                                </div>
                                <Button
                                    onClick={handleDemoEndMeeting}
                                    disabled={!canEnd || isDemoEnding}
                                    aria-label="Record the walkthrough ending"
                                    className="bg-indigo-600 hover:bg-indigo-700 shrink-0"
                                >
                                    {isDemoEnding ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Recording...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                            Record ending
                                        </>
                                    )}
                                </Button>
                            </div>

                            {demoEndingNote && (
                                <p className="text-xs text-indigo-300 mt-2">{demoEndingNote}</p>
                            )}
                            {demoEndingError && (
                                <p role="alert" className="text-xs text-red-400 mt-2">
                                    {demoEndingError}
                                </p>
                            )}

                            {isDemoEnding && demoVotes.length > 0 && (
                                <div className="mt-3 space-y-1.5">
                                    {demoVotes.map((vote) => (
                                        <div key={vote.participant_id} className="text-xs text-zinc-400">
                                            <span className="font-medium text-zinc-200">{vote.participant_name}</span>
                                            : {vote.vote ? 'yes' : 'no'} — {vote.reason}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {demoBrief && (
                                <div className="mt-3 rounded border border-indigo-800/40 bg-indigo-900/20 p-3 text-xs text-zinc-300 whitespace-pre-wrap">
                                    {demoBrief}
                                    {isDemoEnding && <span className="animate-pulse">▌</span>}
                                </div>
                            )}
                        </Card>
                    </div>
                ) : (
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
                                        disabled={!canEnd}
                                        aria-label="End this meeting"
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
