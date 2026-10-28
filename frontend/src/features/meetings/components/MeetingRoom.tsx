'use client';

/**
 * Canonical meeting room (spec-10).
 *
 * TanStack Query owns the meeting record and all supporting reads; the turn
 * controller owns command/observation identity. This component holds only
 * presentational tab state and the composer draft. No legacy store is read or
 * written here, and navigation never replays a paid command.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle,
    ArrowLeft,
    Bot,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    FileText,
    Loader2,
    Lock,
    LogOut,
    MessageSquare,
    Scroll,
    Send,
    User,
    Users,
    XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn, formatCost, formatRelativeTime } from '@/lib/utils';
import type {
    AIParticipant,
    Consensus,
    ContextStats,
    Disagreement,
    MeetingWithParticipants,
    Message,
} from '../api/decoders';
import type { TurnOperation } from '../api/turn-decoders';
import type { TurnProjection } from '../api/turn-projection';
import type { ClosingStage } from '../api/closing-decoders';
import { isPollingClosingStage } from '../api/closing-decoders';
import { useClosingObservation } from '../api/use-closing-observation';
import { useRecordedClosingText } from '../hooks/use-recorded-closing-text';
import { isNearScrollBottom, scrollBehavior } from '../model/scroll';
import { useMeetingTurnController } from '../hooks/use-meeting-turn-controller';
import { useMeetingsRuntime } from '../runtime/context';
import {
    useRuntimeConsensus,
    useRuntimeContextStats,
    useRuntimeDisagreements,
    useRuntimeMeeting,
} from '../runtime/hooks';
import {
    captureSentDraft,
    editDraft,
    initialDraft,
    isSameDraftInFlight,
    shouldClearAfterSend,
    type Draft,
    type SentDraft,
} from '../model/draft';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolUseBlock } from './ToolUseBlock';
import { CitationsBlock } from './CitationsBlock';
import { ClosingPanel } from './ClosingPanel';

export interface MeetingRoomProps {
    meetingId: string;
}

const TERMINAL_STATUSES = ['completed', 'failed', 'interrupted', 'cancelled'];

function isTerminal(status: string): boolean {
    return TERMINAL_STATUSES.includes(status);
}

export function MeetingRoom({ meetingId }: MeetingRoomProps) {
    const runtime = useMeetingsRuntime();
    const meetingQuery = useRuntimeMeeting(meetingId);
    const disagreementsQuery = useRuntimeDisagreements(meetingId);
    const consensusQuery = useRuntimeConsensus(meetingId);
    const contextStatsQuery = useRuntimeContextStats(meetingId);

    if (!meetingId) {
        return <RoomNotice text="No meeting selected." />;
    }
    if (meetingQuery.isPending) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
            </div>
        );
    }
    if (meetingQuery.isError || !meetingQuery.data) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3 text-zinc-400">
                <AlertTriangle className="w-8 h-8 text-amber-500" />
                <p>This meeting could not be loaded.</p>
                <Button variant="outline" onClick={() => void meetingQuery.refetch()}>
                    Try again
                </Button>
            </div>
        );
    }

    const meeting = meetingQuery.data;
    return (
        <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
            <header className="border-b border-zinc-800 px-4 py-3 flex items-center gap-4 shrink-0">
                <Link
                    href={runtime.presentation.homeHref}
                    className="text-zinc-400 hover:text-white transition-colors p-1 rounded hover:bg-zinc-800"
                    aria-label="Back to meetings"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-semibold text-white truncate">{meeting.name}</h1>
                    {meeting.agenda && (
                        <p className="text-xs text-zinc-500 truncate max-w-md">{meeting.agenda}</p>
                    )}
                </div>
                <Badge
                    variant="secondary"
                    className={cn(
                        runtime.scope.identity.kind === 'replay'
                            ? 'bg-indigo-900/40 text-indigo-300'
                            : 'bg-zinc-800 text-zinc-400'
                    )}
                >
                    {runtime.presentation.label}
                </Badge>
                {runtime.restart && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-zinc-700 text-zinc-300"
                        onClick={runtime.restart}
                    >
                        Restart
                    </Button>
                )}
                <RoomStatus status={meeting.status} />
            </header>

            <div className="flex-1 flex min-h-0 overflow-hidden">
                <MeetingConversation
                    meeting={meeting}
                    disagreements={disagreementsQuery.data ?? []}
                    consensus={consensusQuery.data ?? []}
                />
                <RoomDetailsPanel
                    meeting={meeting}
                    disagreements={disagreementsQuery.data ?? []}
                    consensus={consensusQuery.data ?? []}
                    contextStats={contextStatsQuery.data}
                />
            </div>
        </div>
    );
}

function RoomStatus({ status }: { status: string }) {
    const color =
        status === 'active'
            ? 'bg-emerald-900/40 text-emerald-400'
            : status === 'ended'
              ? 'bg-zinc-800 text-zinc-400'
              : status === 'archived'
                ? 'bg-amber-900/40 text-amber-400'
                : 'bg-indigo-900/40 text-indigo-300';
    return (
        <Badge variant="secondary" className={cn('capitalize', color)}>
            {status}
        </Badge>
    );
}

function RoomNotice({ text }: { text: string }) {
    return (
        <div className="flex-1 flex items-center justify-center bg-zinc-950">
            <p className="text-zinc-500">{text}</p>
        </div>
    );
}

interface ConversationProps {
    meeting: MeetingWithParticipants;
    disagreements: Disagreement[];
    consensus: Consensus[];
}

function MeetingConversation({ meeting, disagreements, consensus }: ConversationProps) {
    const runtime = useMeetingsRuntime();
    const { capabilities, slots } = runtime;
    const turns = useMeetingTurnController({
        meetingId: meeting.id,
        runtime,
    });
    const closingObservation = useClosingObservation({
        meetingId: meeting.id,
        enabled: capabilities.closing,
        runtime,
    });
    const recordedClosingText = useRecordedClosingText({
        runtime,
        meetingId: meeting.id,
        closingId: closingObservation.closing?.closing_id ?? null,
        enabled: capabilities.closing,
    });
    const [tab, setTab] = useState('chat');
    const DocumentsPanel = slots.documentPanel;
    const SummaryPanel = slots.summaryPanel;

    const closingStage: ClosingStage | null = closingObservation.closing?.stage ?? null;
    const closingOpen =
        isPollingClosingStage(closingStage) || closingStage === 'failed';
    const closingCompleted = closingStage === 'completed';
    const ended =
        meeting.status === 'ended' ||
        meeting.status === 'archived' ||
        closingCompleted;
    const readOnly = ended || !capabilities.submitTurn;

    const openClosing = () => setTab('closing');

    return (
        <div className="flex-1 flex flex-col bg-zinc-950 min-h-0 overflow-hidden">
            <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
                <div className="border-b border-zinc-800 px-4 shrink-0 overflow-x-auto">
                    <TabsList className="bg-transparent h-12 gap-1">
                        <RoomTab value="chat" icon={<MessageSquare className="w-4 h-4" />} label="Chat" />
                        {capabilities.disagreements && (
                            <RoomTab
                                value="disagreements"
                                icon={<AlertTriangle className="w-4 h-4" />}
                                label="Disagreements"
                                count={disagreements.length}
                                tone="red"
                            />
                        )}
                        {capabilities.consensus && (
                            <RoomTab
                                value="consensus"
                                icon={<CheckCircle2 className="w-4 h-4" />}
                                label="Consensus"
                                count={consensus.length}
                                tone="green"
                            />
                        )}
                        <RoomTab value="roster" icon={<Users className="w-4 h-4" />} label="Roster" />
                        {capabilities.documents && DocumentsPanel && (
                            <RoomTab
                                value="documents"
                                icon={<FileText className="w-4 h-4" />}
                                label="Shared Docs"
                            />
                        )}
                        {capabilities.summary && SummaryPanel && (
                            <RoomTab
                                value="summary"
                                icon={<Scroll className="w-4 h-4" />}
                                label="Summary"
                            />
                        )}
                        {capabilities.closing && (
                            <RoomTab
                                id="closing-tab"
                                value="closing"
                                icon={<LogOut className="w-4 h-4" />}
                                label="Close"
                            />
                        )}
                    </TabsList>
                </div>

                {turns.actionError && (
                    <div className="mx-4 mt-4 p-3 bg-amber-950/40 border border-amber-800 rounded-lg flex items-center gap-2 text-amber-300 shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm flex-1">{turns.actionError}</span>
                        <button onClick={turns.clearActionError} className="text-xs hover:underline">
                            Dismiss
                        </button>
                    </div>
                )}

                <TabsContent value="chat" className="flex-1 flex flex-col m-0 min-h-0">
                    <MessageList
                        meeting={meeting}
                        activeOperation={turns.activeOperation}
                        projection={turns.projection}
                        isObserving={turns.isObserving}
                        onResume={turns.resumeObservation}
                    />
                </TabsContent>

                {capabilities.disagreements && (
                    <TabsContent value="disagreements" className="flex-1 m-0 min-h-0">
                        <DisagreementsPanel disagreements={disagreements} />
                    </TabsContent>
                )}

                {capabilities.consensus && (
                    <TabsContent value="consensus" className="flex-1 m-0 min-h-0">
                        <ConsensusPanel consensus={consensus} />
                    </TabsContent>
                )}

                <TabsContent value="roster" className="flex-1 m-0 min-h-0">
                    <ParticipantRoster participants={meeting.participants ?? []} />
                </TabsContent>

                {capabilities.documents && DocumentsPanel && (
                    <TabsContent value="documents" className="flex-1 m-0 min-h-0">
                        <DocumentsPanel meetingId={meeting.id} />
                    </TabsContent>
                )}

                {capabilities.summary && SummaryPanel && (
                    <TabsContent value="summary" className="flex-1 m-0 min-h-0">
                        <SummaryPanel meeting={meeting} />
                    </TabsContent>
                )}

                {capabilities.closing && (
                    <TabsContent value="closing" className="flex-1 m-0 min-h-0">
                        <div className="h-full overflow-y-auto p-4">
                            <div className="mx-auto max-w-3xl">
                                <ClosingPanel
                                    meetingId={meeting.id}
                                    meetingStatus={meeting.status}
                                    textProjection={
                                        runtime.closingStream
                                            ? recordedClosingText
                                            : undefined
                                    }
                                />
                            </div>
                        </div>
                    </TabsContent>
                )}
            </Tabs>

            {closingOpen ? (
                tab !== 'closing' ? (
                    <ClosingRoomNotice stage={closingStage} onOpen={openClosing} />
                ) : null
            ) : readOnly ? (
                <div className="p-4 border-t border-zinc-800 shrink-0 bg-zinc-950">
                    <p className="text-center text-sm text-zinc-500">
                        {runtime.presentation.readOnlyNotice}
                    </p>
                </div>
            ) : (
                <>
                    {capabilities.closing && (
                        <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-2 shrink-0">
                            <div className="mx-auto flex max-w-3xl justify-end">
                                <Button
                                    id="closing-entry"
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-zinc-400 hover:text-white"
                                    onClick={openClosing}
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Close meeting
                                </Button>
                            </div>
                        </div>
                    )}
                    <RoomControls meeting={meeting} turns={turns} />
                </>
            )}
        </div>
    );
}

function ClosingRoomNotice({
    stage,
    onOpen,
}: {
    stage: ClosingStage | null;
    onOpen: () => void;
}) {
    const title =
        stage === 'failed'
            ? 'Closing failed'
            : stage === 'draining'
              ? 'Finishing queued work'
              : stage === 'voting'
                ? 'Voting on whether to end'
                : stage === 'summarizing'
                  ? 'Writing the final summary'
                  : 'Closing in progress';
    const detail =
        stage === 'failed'
            ? 'Turn submission is paused until you retry or abort the close.'
            : 'Turn submission is paused while the close is in progress. You can leave and come back; observation resumes without regenerating work.';

    return (
        <div
            id="closing-room-status"
            role="status"
            aria-live="polite"
            className="border-t border-zinc-800 bg-zinc-950 px-4 py-3 shrink-0"
        >
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="text-xs text-zinc-500">{detail}</p>
                </div>
                <Button
                    id="closing-room-view"
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-zinc-700 text-zinc-300"
                    onClick={onOpen}
                >
                    View closing
                </Button>
            </div>
        </div>
    );
}

function RoomTab({
    id,
    value,
    icon,
    label,
    count,
    tone,
}: {
    id?: string;
    value: string;
    icon: React.ReactNode;
    label: string;
    count?: number;
    tone?: 'red' | 'green';
}) {
    return (
        <TabsTrigger
            id={id}
            value={value}
            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 px-3"
        >
            {icon}
            <span className="ml-2">{label}</span>
            {count !== undefined && count > 0 && (
                <Badge
                    variant="secondary"
                    className={cn(
                        'ml-2 h-5 px-1.5 text-xs',
                        tone === 'red'
                            ? 'bg-red-900/50 text-red-400'
                            : 'bg-green-900/50 text-green-400'
                    )}
                >
                    {count}
                </Badge>
            )}
        </TabsTrigger>
    );
}

interface MessageListProps {
    meeting: MeetingWithParticipants;
    activeOperation: TurnOperation | null | undefined;
    projection: TurnProjection | undefined;
    isObserving: boolean;
    onResume: () => void;
}

function MessageList({
    meeting,
    activeOperation,
    projection,
    isObserving,
    onResume,
}: MessageListProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);

    useEffect(() => {
        const viewport = contentRef.current?.closest<HTMLElement>(
            '[data-slot="scroll-area-viewport"]'
        );
        if (!viewport) return;

        const updateStickiness = () => {
            stickToBottomRef.current = isNearScrollBottom(viewport);
        };
        updateStickiness();
        viewport.addEventListener('scroll', updateStickiness, { passive: true });
        return () => viewport.removeEventListener('scroll', updateStickiness);
    }, []);

    useEffect(() => {
        if (!stickToBottomRef.current) return;
        const reducedMotion =
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        scrollRef.current?.scrollIntoView({
            behavior: scrollBehavior(reducedMotion),
            block: 'end',
        });
    }, [meeting.messages, projection?.text]);

    return (
        <ScrollArea className="flex-1 min-h-0 p-4">
            <div ref={contentRef} className="space-y-4 max-w-3xl mx-auto">
                {(meeting.messages ?? []).map((message) => (
                    <MessageBubble
                        key={message.id}
                        message={message}
                        participant={(meeting.participants ?? []).find(
                            (p) => p.id === message.sender_id
                        )}
                    />
                ))}

                {activeOperation && (
                    <TurnProjectionBubble
                        operation={activeOperation}
                        projection={projection}
                        participant={(meeting.participants ?? []).find(
                            (p) => p.id === activeOperation.participant_id
                        )}
                        isObserving={isObserving}
                        onResume={onResume}
                    />
                )}

                {(meeting.messages ?? []).length === 0 && !activeOperation && (
                    <div className="text-center py-12 text-zinc-500">
                        <p>No messages yet. Start the conversation!</p>
                    </div>
                )}
                <div ref={scrollRef} />
            </div>
        </ScrollArea>
    );
}

interface RoomControlsProps {
    meeting: MeetingWithParticipants;
    turns: ReturnType<typeof useMeetingTurnController>;
}

function RoomControls({ meeting, turns }: RoomControlsProps) {
    const runtime = useMeetingsRuntime();
    const ParticipantAction = runtime.slots.participantAction;

    const handleStartTurn = (
        participantId: string,
        settings?: Parameters<typeof turns.submit>[1]
    ) => {
        void turns.submit(participantId, settings);
    };

    const nonTerminal = turns.operations.filter((operation) => !isTerminal(operation.status));

    return (
        <div className="p-4 border-t border-zinc-800 shrink-0 bg-zinc-950">
            <div className="max-w-3xl mx-auto">
                <p className="text-xs text-zinc-400 mb-3">Who speaks next?</p>
                <div className="flex flex-wrap gap-2 mb-4">
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-zinc-700 hover:bg-zinc-800 bg-indigo-600/20 border-indigo-500 text-indigo-400"
                    >
                        <User className="w-4 h-4 mr-1" />
                        You
                    </Button>
                    {(meeting.participants ?? []).map((participant) => {
                        const isActive = turns.activeParticipantId === participant.id;
                        const isQueued = turns.operations.some(
                            (operation) =>
                                operation.participant_id === participant.id &&
                                operation.status === 'queued'
                        );
                        if (!ParticipantAction) return null;
                        return (
                            <ParticipantAction
                                key={participant.id}
                                participant={participant}
                                isActive={isActive}
                                isQueued={isQueued}
                                disabled={turns.isSubmitting}
                                onStart={(settings) =>
                                    handleStartTurn(participant.id, settings)
                                }
                            />
                        );
                    })}
                </div>

                {nonTerminal.length > 0 && (
                    <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/60 divide-y divide-zinc-800">
                        {nonTerminal.map((operation) => (
                            <QueueRow
                                key={operation.operation_id}
                                operation={operation}
                                meeting={meeting}
                                turns={turns}
                            />
                        ))}
                    </div>
                )}

                {runtime.capabilities.sendMessage && (
                    <MessageComposer meetingId={meeting.id} />
                )}
            </div>
        </div>
    );
}

function QueueRow({
    operation,
    meeting,
    turns,
}: {
    operation: TurnOperation;
    meeting: MeetingWithParticipants;
    turns: ReturnType<typeof useMeetingTurnController>;
}) {
    const participant = (meeting.participants ?? []).find(
        (item) => item.id === operation.participant_id
    );
    const isExecuting = operation.status === 'executing';
    const isCanceling =
        turns.cancelingOperationId === operation.operation_id || operation.cancel_requested;

    return (
        <div className="flex items-center gap-2 px-3 py-2 text-xs">
            {isExecuting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            ) : (
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
            )}
            <span className="font-medium" style={{ color: participant?.color }}>
                {participant?.name ?? 'Participant'}
            </span>
            <span className="text-zinc-500">
                {isExecuting
                    ? operation.cancel_requested
                        ? 'canceling…'
                        : 'executing'
                    : operation.queue_position
                      ? `queued #${operation.queue_position}`
                      : 'queued'}
            </span>
            <div className="flex-1" />
            {turns.projection?.observationInterrupted &&
                turns.activeOperation?.operation_id === operation.operation_id && (
                    <button onClick={turns.resumeObservation} className="text-indigo-400 hover:underline">
                        Resume observation
                    </button>
                )}
            <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-zinc-400 hover:text-red-400"
                disabled={isCanceling}
                onClick={() => void turns.cancel(operation.operation_id)}
                aria-label={`Cancel ${participant?.name ?? 'turn'}`}
            >
                <XCircle className="w-3.5 h-3.5 mr-1" />
                {isCanceling ? 'Canceling' : 'Cancel'}
            </Button>
        </div>
    );
}

function MessageComposer({ meetingId }: { meetingId: string }) {
    const runtime = useMeetingsRuntime();
    const queryClient = useQueryClient();
    const sendMessage = useMutation({
        mutationFn: (content: string) =>
            runtime.commands.sendMessage(
                meetingId,
                content,
                runtime.signal
            ),
        onSuccess: (message: Message) => {
            queryClient.setQueryData<MeetingWithParticipants>(
                runtime.keys.meetingDetail(meetingId),
                (cached) =>
                    cached
                        ? {
                              ...cached,
                              messages: [...(cached.messages ?? []), message],
                          }
                        : cached
            );
            void queryClient.invalidateQueries({
                queryKey: runtime.keys.contextStats(meetingId),
            });
        },
    });
    const [inputValue, setInputValue] = useState('');
    const draftRef = useRef<Draft>(initialDraft());
    const sentRef = useRef<SentDraft | null>(null);

    const input = (text: string) => {
        draftRef.current = editDraft(draftRef.current, text);
        setInputValue(text);
    };

    const handleSend = async () => {
        const draftNow = draftRef.current;
        const content = draftNow.text.trim();
        if (!content) return;
        if (isSameDraftInFlight(sentRef.current, meetingId, draftNow)) return;

        const sent = captureSentDraft(meetingId, draftNow);
        sentRef.current = sent;
        let outcome: 'confirmed' | 'failed' = 'failed';
        try {
            await sendMessage.mutateAsync(content);
            outcome = 'confirmed';
        } catch {
            outcome = 'failed';
        } finally {
            if (shouldClearAfterSend(sent, outcome, meetingId, draftRef.current)) {
                draftRef.current = initialDraft();
                setInputValue('');
            }
            sentRef.current = null;
        }
    };

    return (
        <div>
            <div className="flex gap-2">
                <Input
                    value={inputValue}
                    onChange={(event) => input(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            void handleSend();
                        }
                    }}
                    placeholder="Type your message..."
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                />
                <Button
                    onClick={() => void handleSend()}
                    disabled={!inputValue.trim() || sendMessage.isPending}
                    aria-label="Send message"
                    className="bg-indigo-600 hover:bg-indigo-700"
                >
                    {sendMessage.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Send className="w-4 h-4" />
                    )}
                </Button>
            </div>
            {sendMessage.isError && (
                <p className="mt-2 text-xs text-red-400">
                    The message was not saved. Your draft is still here; try again.
                </p>
            )}
        </div>
    );
}

function DisagreementsPanel({ disagreements }: { disagreements: Disagreement[] }) {
    return (
        <ScrollArea className="h-full p-4">
            <div className="max-w-3xl mx-auto">
                {disagreements.length === 0 ? (
                    <EmptyTab
                        icon={<AlertTriangle className="w-12 h-12" />}
                        title="No Disagreements Yet"
                        text="When AI participants disagree, their debates will appear here."
                    />
                ) : (
                    <div className="space-y-4">
                        <p className="text-sm text-zinc-400 mb-4">
                            {disagreements.length} disagreement
                            {disagreements.length !== 1 ? 's' : ''} logged
                        </p>
                        {disagreements.map((disagreement) => (
                            <DisagreementCard key={disagreement.id} disagreement={disagreement} />
                        ))}
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}

function ConsensusPanel({ consensus }: { consensus: Consensus[] }) {
    return (
        <ScrollArea className="h-full p-4">
            <div className="max-w-3xl mx-auto">
                {consensus.length === 0 ? (
                    <EmptyTab
                        icon={<CheckCircle2 className="w-12 h-12" />}
                        title="No Consensus Yet"
                        text="When AI participants reach agreement, it will appear here."
                    />
                ) : (
                    <div className="space-y-4">
                        <p className="text-sm text-zinc-400 mb-4">
                            {consensus.length} consensus point
                            {consensus.length !== 1 ? 's' : ''} reached
                        </p>
                        {consensus.map((item) => (
                            <ConsensusCard key={item.id} consensus={item} />
                        ))}
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}

function EmptyTab({
    icon,
    title,
    text,
}: {
    icon: React.ReactNode;
    title: string;
    text: string;
}) {
    return (
        <div className="text-center py-16 text-zinc-500">
            <div className="mx-auto mb-3 opacity-50 w-12 h-12">{icon}</div>
            <h3 className="text-lg font-medium text-zinc-400 mb-1">{title}</h3>
            <p className="text-sm">{text}</p>
        </div>
    );
}

function DisagreementCard({ disagreement }: { disagreement: Disagreement }) {
    const severityColors: Record<number, string> = {
        1: 'border-yellow-800/50 bg-yellow-900/20',
        2: 'border-orange-800/50 bg-orange-900/20',
        3: 'border-red-800/50 bg-red-900/20',
        4: 'border-red-700/50 bg-red-900/30',
        5: 'border-red-600/50 bg-red-900/40',
    };
    const severity = (disagreement.severity || 3) as keyof typeof severityColors;
    return (
        <Card className={cn('p-4 border', severityColors[severity])}>
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <h4 className="font-medium text-white">{disagreement.topic}</h4>
                    <Badge
                        variant="secondary"
                        className={cn(
                            'shrink-0 text-xs',
                            disagreement.status === 'open'
                                ? 'bg-red-900/50 text-red-400'
                                : 'bg-zinc-700 text-zinc-400'
                        )}
                    >
                        {disagreement.status}
                    </Badge>
                </div>
                <p className="text-sm text-zinc-400">{disagreement.reasoning}</p>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span>
                        Challenging:{' '}
                        <span className="text-zinc-300">{disagreement.target_name}</span>
                    </span>
                    <span>•</span>
                    <span>{formatRelativeTime(disagreement.created_at)}</span>
                    <span>•</span>
                    <span>Severity: {severity}/5</span>
                </div>
            </div>
        </Card>
    );
}

function ConsensusCard({ consensus }: { consensus: Consensus }) {
    const strengthColors: Record<number, string> = {
        1: 'border-green-800/30 bg-green-900/10',
        2: 'border-green-800/40 bg-green-900/15',
        3: 'border-green-700/50 bg-green-900/20',
        4: 'border-green-600/50 bg-green-900/25',
        5: 'border-green-500/50 bg-green-900/30',
    };
    const strength = (consensus.strength || 3) as keyof typeof strengthColors;
    return (
        <Card className={cn('p-4 border', strengthColors[strength])}>
            <div className="space-y-3">
                <h4 className="font-medium text-white">{consensus.topic}</h4>
                <div className="flex flex-wrap gap-2">
                    {(consensus.participants as string[]).map((name, index) => (
                        <Badge
                            key={`${name}-${index}`}
                            variant="secondary"
                            className="text-xs bg-green-900/40 text-green-400"
                        >
                            {name}
                        </Badge>
                    ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span>Strength: {strength}/5</span>
                    <span>•</span>
                    <span>{formatRelativeTime(consensus.created_at)}</span>
                </div>
            </div>
        </Card>
    );
}

function ParticipantRoster({ participants }: { participants: AIParticipant[] }) {
    return (
        <ScrollArea className="h-full p-4">
            <div className="max-w-3xl mx-auto space-y-4">
                <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-1">AI Roster</h3>
                    <p className="text-sm text-zinc-400">
                        View the AI participants in this meeting. Each AI has its own
                        personality and system prompt.
                    </p>
                </div>
                {participants.length === 0 ? (
                    <EmptyTab
                        icon={<Bot className="w-12 h-12" />}
                        title="No Participants"
                        text="This meeting has no AI participants."
                    />
                ) : (
                    <div className="space-y-3">
                        {participants.map((participant) => (
                            <ParticipantDetailCard
                                key={participant.id}
                                participant={participant}
                            />
                        ))}
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}

function ParticipantDetailCard({ participant }: { participant: AIParticipant }) {
    const [promptOpen, setPromptOpen] = useState(false);
    const [knowledgeOpen, setKnowledgeOpen] = useState(false);
    const stackCount = participant.stack_ids?.length ?? 0;

    return (
        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
            <div className="p-4 flex items-start gap-4">
                <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                    style={{ backgroundColor: participant.color }}
                >
                    {participant.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-white">{participant.name}</h4>
                        <Badge
                            variant="secondary"
                            className="text-xs capitalize"
                            style={{
                                backgroundColor: participant.color + '20',
                                color: participant.color,
                            }}
                        >
                            {participant.role}
                        </Badge>
                    </div>
                    <p className="text-xs text-zinc-500">
                        Model: {participant.provider_config?.model || 'Default'}
                    </p>
                </div>
            </div>
            <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="w-full justify-between px-4 py-2 h-auto text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-none border-t border-zinc-800"
                    >
                        <span className="flex items-center gap-2">
                            <Bot className="w-4 h-4" />
                            System Prompt
                        </span>
                        {promptOpen ? (
                            <ChevronUp className="w-4 h-4" />
                        ) : (
                            <ChevronDown className="w-4 h-4" />
                        )}
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="px-4 py-3 bg-zinc-950/50 border-t border-zinc-800">
                        <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                            {participant.system_prompt}
                        </pre>
                    </div>
                </CollapsibleContent>
            </Collapsible>
            <Collapsible open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="w-full justify-between px-4 py-2 h-auto text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-none border-t border-zinc-800"
                    >
                        <span className="flex items-center gap-2">
                            <Lock className="w-4 h-4" />
                            Private Knowledge Stack
                            <Badge variant="secondary" className="text-xs bg-zinc-800 text-zinc-400">
                                {stackCount} stack{stackCount === 1 ? '' : 's'}
                            </Badge>
                        </span>
                        {knowledgeOpen ? (
                            <ChevronUp className="w-4 h-4" />
                        ) : (
                            <ChevronDown className="w-4 h-4" />
                        )}
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="px-4 py-3 bg-zinc-950/50 border-t border-zinc-800">
                        {stackCount === 0 ? (
                            <p className="text-xs text-zinc-500 italic">
                                No private knowledge stacks linked to this AI.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {participant.stack_ids?.map((stackId) => (
                                    <li key={stackId} className="flex items-center gap-2 text-sm">
                                        <FileText className="w-4 h-4 text-zinc-500" />
                                        <span className="text-zinc-300 font-mono text-xs">
                                            {stackId}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}



function RoomDetailsPanel({
    meeting,
    disagreements,
    consensus,
    contextStats,
}: {
    meeting: MeetingWithParticipants;
    disagreements: Disagreement[];
    consensus: Consensus[];
    contextStats: ContextStats | undefined;
}) {
    return (
        <aside className="w-72 border-l border-zinc-800 bg-zinc-950 p-4 overflow-y-auto shrink-0 hidden lg:block">
            <h3 className="text-sm font-semibold text-white mb-3">Meeting Info</h3>
            <div className="space-y-2 text-xs text-zinc-400 mb-6">
                <div className="flex justify-between">
                    <span>Participants</span>
                    <span className="text-zinc-200">{meeting.participants?.length ?? 0}</span>
                </div>
                <div className="flex justify-between">
                    <span>Messages</span>
                    <span className="text-zinc-200">{meeting.messages?.length ?? 0}</span>
                </div>
                <div className="flex justify-between">
                    <span>Disagreements</span>
                    <span className="text-zinc-200">{disagreements.length}</span>
                </div>
                <div className="flex justify-between">
                    <span>Consensus</span>
                    <span className="text-zinc-200">{consensus.length}</span>
                </div>
                {meeting.total_cost > 0 && (
                    <div className="flex justify-between">
                        <span>Cost</span>
                        <span className="text-zinc-200">{formatCost(meeting.total_cost)}</span>
                    </div>
                )}
            </div>

            {contextStats && (
                <div className="mb-6">
                    <h4 className="text-xs font-medium text-zinc-300 mb-2">Context Usage</h4>
                    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                            className={cn(
                                'h-full rounded-full',
                                contextStats.usage_percent > 80
                                    ? 'bg-red-500'
                                    : contextStats.usage_percent > 60
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                            )}
                            style={{
                                width: `${Math.min(contextStats.usage_percent, 100)}%`,
                            }}
                        />
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                        {contextStats.current_tokens.toLocaleString()} /{' '}
                        {contextStats.max_tokens.toLocaleString()} tokens
                    </p>
                </div>
            )}

            <h4 className="text-xs font-medium text-zinc-300 mb-2">Participants</h4>
            <div className="space-y-2">
                {(meeting.participants ?? []).map((participant) => (
                    <div
                        key={participant.id}
                        className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2"
                    >
                        <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ backgroundColor: participant.color }}
                        >
                            {participant.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-zinc-200 truncate">
                                {participant.name}
                            </p>
                            <p className="text-[11px] text-zinc-500 capitalize truncate">
                                {participant.role}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}

function MessageBubble({
    message,
    participant,
}: {
    message: Message;
    participant?: AIParticipant;
}) {
    const isUser = message.sender_type === 'user';
    const isSystem = message.sender_type === 'system';
    const toolCalls =
        (message.tool_artifacts as { tool_calls?: Array<{ tool: string; result: string }> })
            ?.tool_calls || [];

    return (
        <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
            <div
                className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                    isUser && 'bg-indigo-600',
                    isSystem && 'bg-zinc-700'
                )}
                style={participant ? { backgroundColor: participant.color } : undefined}
            >
                {isUser ? (
                    <User className="w-4 h-4 text-white" />
                ) : isSystem ? (
                    <Bot className="w-4 h-4 text-zinc-400" />
                ) : (
                    <span className="text-white text-sm font-bold">
                        {message.sender_name.charAt(0)}
                    </span>
                )}
            </div>
            <div className={cn('flex-1 max-w-[80%]', isUser && 'flex flex-col items-end')}>
                <div className="flex items-center gap-2 mb-1">
                    <span
                        className={cn(
                            'text-sm font-medium',
                            isUser ? 'text-indigo-400' : 'text-white'
                        )}
                        style={participant ? { color: participant.color } : undefined}
                    >
                        {message.sender_name}
                    </span>
                    <span className="text-xs text-zinc-500">
                        {formatRelativeTime(message.created_at)}
                    </span>
                    {message.estimated_cost > 0 && (
                        <Badge variant="secondary" className="text-xs bg-zinc-800 text-zinc-400">
                            {formatCost(message.estimated_cost)}
                        </Badge>
                    )}
                </div>
                {message.thinking_content && (
                    <ThinkingBlock content={message.thinking_content} isStreaming={false} />
                )}
                {toolCalls.length > 0 && (
                    <div className="mb-2">
                        {toolCalls.map((toolCall, index) => (
                            <ToolUseBlock
                                key={`${toolCall.tool}-${index}`}
                                toolName={toolCall.tool}
                                result={toolCall.result}
                            />
                        ))}
                    </div>
                )}
                <div
                    className={cn(
                        'rounded-2xl px-4 py-2.5',
                        isUser
                            ? 'bg-indigo-600 text-white rounded-br-md'
                            : 'bg-zinc-800 text-zinc-100 rounded-bl-md',
                        isSystem && 'bg-zinc-800/50 text-zinc-400 italic'
                    )}
                >
                    {isUser || isSystem ? (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    ) : (
                        <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-zinc-900 prose-pre:text-zinc-300 prose-code:bg-zinc-900 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-indigo-300 prose-code:before:content-none prose-code:after:content-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.content}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
                {message.citations && message.citations.length > 0 && (
                    <CitationsBlock
                        citations={message.citations.map((citation) => ({
                            source: citation.source,
                            title: citation.title ?? undefined,
                            url: citation.url ?? undefined,
                            snippet: citation.snippet ?? undefined,
                        }))}
                    />
                )}
            </div>
        </div>
    );
}

function TurnProjectionBubble({
    operation,
    projection,
    participant,
    isObserving,
    onResume,
}: {
    operation: TurnOperation;
    projection: TurnProjection | undefined;
    participant?: { name: string; color: string };
    isObserving: boolean;
    onResume: () => void;
}) {
    const name = participant?.name ?? 'Participant';
    const color = participant?.color ?? '#71717a';
    const isQueued = operation.status === 'queued';
    const hasContent =
        Boolean(projection?.text) ||
        Boolean(projection?.thinking) ||
        (projection?.toolCalls.length ?? 0) > 0;

    return (
        <div className="flex gap-3">
            <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: color }}
            >
                <span className="text-white text-sm font-bold">{name.charAt(0)}</span>
            </div>
            <div className="flex-1 max-w-[80%]">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium" style={{ color }}>
                        {name}
                    </span>
                    {isQueued ? (
                        <Badge variant="secondary" className="text-xs bg-zinc-800 text-zinc-400">
                            <Clock className="w-3 h-3 mr-1" />
                            Queued
                            {operation.queue_position ? ` #${operation.queue_position}` : ''}
                        </Badge>
                    ) : (
                        <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />
                    )}
                    {!isQueued && isObserving && (
                        <span className="text-xs text-zinc-500">live</span>
                    )}
                </div>

                {projection?.thinking && (
                    <ThinkingBlock
                        content={projection.thinking}
                        isStreaming={!projection.terminal && !projection.observationInterrupted}
                    />
                )}

                {projection?.toolCalls.map((tool) => (
                    <ToolUseBlock
                        key={tool.identity}
                        toolName={tool.name}
                        arguments={
                            tool.arguments && typeof tool.arguments === 'object'
                                ? (tool.arguments as Record<string, unknown>)
                                : undefined
                        }
                        result={formatToolResult(tool.result)}
                        isExecuting={tool.isExecuting}
                    />
                ))}

                {projection?.text && (
                    <div className="rounded-2xl px-4 py-2.5 bg-zinc-800 text-zinc-100 rounded-bl-md">
                        <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-zinc-900 prose-pre:text-zinc-300 prose-code:bg-zinc-900 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-indigo-300 prose-code:before:content-none prose-code:after:content-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {projection.text}
                            </ReactMarkdown>
                            {!projection.terminal && !projection.observationInterrupted && (
                                <span className="inline-block w-2 h-4 ml-1 bg-zinc-400 animate-pulse" />
                            )}
                        </div>
                    </div>
                )}

                {projection && projection.citations.length > 0 && (
                    <CitationsBlock
                        citations={projection.citations.map((citation) => ({
                            source: citation.source,
                            title: citation.title ?? undefined,
                            url: citation.url ?? undefined,
                            snippet: citation.snippet ?? undefined,
                        }))}
                    />
                )}

                {projection?.error && (
                    <div className="mt-2 rounded-lg border border-red-800/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                        {projection.error.message}
                    </div>
                )}

                {projection?.observationInterrupted && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span className="flex-1">
                            Observation paused. The turn continues on the server; this is not a
                            failure.
                        </span>
                        <button onClick={onResume} className="hover:underline">
                            Resume
                        </button>
                    </div>
                )}

                {!hasContent && !projection?.error && !projection?.observationInterrupted && (
                    <div className="rounded-2xl px-4 py-2.5 bg-zinc-800 text-zinc-500 rounded-bl-md">
                        <div className="flex items-center gap-2 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {isQueued ? 'Waiting in the meeting queue…' : 'Thinking…'}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function formatToolResult(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}
