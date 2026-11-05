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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { readableTextOn } from '@/lib/readable-color';
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
import { isNearScrollBottom } from '../model/scroll';
import { useMeetingTurnController } from '../hooks/use-meeting-turn-controller';
import { useMeetingsRuntime } from '../runtime/context';
import {
    PreparedTurnControls,
    ReplaySpeedControl,
} from '../runtime/playback-controls';
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
import { CitationsBlock, type CitationView } from './CitationsBlock';
import { ClosingPanel } from './ClosingPanel';
import { EvidenceCitationTrigger } from '../evidence/trigger';
import { EvidencePreviewHost } from '../evidence/host';
import { EvidencePreviewProvider } from '../evidence/provider';
import {
    useAnchorRef,
    useTutorialStreamingFlag,
    type TutorialAnchorId,
} from '@/features/demo-tutorial';

export interface MeetingRoomProps {
    meetingId: string;
    initialTab?: string;
    /** Route-owned tab for a routable room. Omit for the live room. */
    activeTab?: string;
    onTabChange?: (tab: string) => void;
}

const TERMINAL_STATUSES = ['completed', 'failed', 'interrupted', 'cancelled'];

function isTerminal(status: string): boolean {
    return TERMINAL_STATUSES.includes(status);
}

export function MeetingRoom({
    meetingId,
    initialTab,
    activeTab,
    onTabChange,
}: MeetingRoomProps) {
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
            <div className="min-h-screen bg-canvas flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-ink-muted" />
            </div>
        );
    }
    if (meetingQuery.isError || !meetingQuery.data) {
        return (
            <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-3 text-ink-secondary">
                <AlertTriangle className="w-8 h-8 text-warning" />
                <p>This meeting could not be loaded.</p>
                <Button variant="outline" onClick={() => void meetingQuery.refetch()}>
                    Try again
                </Button>
            </div>
        );
    }

    const meeting = meetingQuery.data;
    const evidence = runtime.evidence;
    const evidenceEpoch = [
        runtime.scope.identity.kind,
        runtime.scope.identity.id,
        runtime.scope.identity.epoch,
        meeting.id,
        runtime.replay?.checkpoint ?? 'live',
    ].join(':');
    const room = (
        <div className="h-screen bg-canvas flex flex-col overflow-hidden">
            <header className="border-b border-separator px-4 py-3 flex items-center gap-4 shrink-0">
                <Link
                    href={runtime.presentation.homeHref}
                    className="text-ink-secondary hover:text-ink transition-colors p-1 rounded hover:bg-surface-raised"
                    aria-label="Back to meetings"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-semibold text-ink truncate">{meeting.name}</h1>
                    {meeting.agenda && (
                        <p className="text-xs text-ink-muted truncate max-w-md">{meeting.agenda}</p>
                    )}
                </div>
                <Badge
                    variant="secondary"
                    className={cn(
                        runtime.scope.identity.kind === 'replay'
                            ? 'bg-accent-soft text-action'
                            : 'bg-surface-raised text-ink-secondary'
                    )}
                >
                    {runtime.presentation.label}
                </Badge>
                {runtime.restart && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-control text-ink-secondary"
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
                    initialTab={initialTab}
                    activeTab={activeTab}
                    onTabChange={onTabChange}
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
    if (!evidence) {
        return room;
    }
    return (
        <EvidencePreviewProvider adapter={evidence} epoch={evidenceEpoch}>
            {room}
            <EvidencePreviewHost />
        </EvidencePreviewProvider>
    );
}

function RoomStatus({ status }: { status: string }) {
    const color =
        status === 'active'
            ? 'bg-success-soft text-success'
            : status === 'ended'
              ? 'bg-surface-raised text-ink-secondary'
              : status === 'archived'
                ? 'bg-warning-soft text-warning'
                : 'bg-accent-soft text-action';
    return (
        <Badge variant="secondary" className={cn('capitalize', color)}>
            {status}
        </Badge>
    );
}

function RoomNotice({ text }: { text: string }) {
    return (
        <div className="flex-1 flex items-center justify-center bg-canvas">
            <p className="text-ink-muted">{text}</p>
        </div>
    );
}

interface ConversationProps {
    meeting: MeetingWithParticipants;
    disagreements: Disagreement[];
    consensus: Consensus[];
    initialTab?: string;
    activeTab?: string;
    onTabChange?: (tab: string) => void;
}

function MeetingConversation({
    meeting,
    disagreements,
    consensus,
    initialTab,
    activeTab,
    onTabChange,
}: ConversationProps) {
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
    const replayCheckpoint = runtime.replay?.checkpoint;
    const [skippedClosingCheckpoint, setSkippedClosingCheckpoint] = useState<
        string | null | undefined
    >(undefined);
    if (
        skippedClosingCheckpoint !== undefined &&
        skippedClosingCheckpoint !== replayCheckpoint
    ) {
        setSkippedClosingCheckpoint(undefined);
    }
    const skipClosingText =
        replayCheckpoint !== undefined &&
        skippedClosingCheckpoint === replayCheckpoint;
    const recordedClosingText = useRecordedClosingText({
        runtime,
        meetingId: meeting.id,
        closingId: closingObservation.closing?.closing_id ?? null,
        enabled: capabilities.closing && !skipClosingText,
    });
    const [localTab, setLocalTab] = useState(initialTab ?? 'chat');
    /**
     * A routable room is controlled by its URL. The URL is the only owner of
     * the visible tab, so the tutorial and the room cannot disagree about
     * which evidence is on screen. The live room keeps its local fallback.
     */
    const tab = activeTab ?? localTab;
    const setTab = (next: string) => {
        if (activeTab === undefined) setLocalTab(next);
        onTabChange?.(next);
    };
    const closeAnchorRef = useAnchorRef('room.close');
    const returnRef = useAnchorRef('room.return');
    useTutorialStreamingFlag(
        'recorded-room',
        Boolean(turns.activeOperation) || turns.isObserving
    );
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
    const openClosing = () => setTab('closing');
    const replayClosing = runtime.replay?.transitions.find(
        (transition) =>
            transition.kind === 'request_closing' &&
            transition.completed_checkpoint === runtime.replay?.checkpoint
    );
    const replayClosingTurn = () => {
        setSkippedClosingCheckpoint(undefined);
        if (replayClosing) void runtime.replay?.replayIntent(replayClosing.intent_id);
    };

    return (
        <div className="flex-1 flex flex-col bg-canvas min-h-0 overflow-hidden">
            <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
                <div className="border-b border-separator px-4 shrink-0 overflow-x-auto overflow-y-hidden">
                    <TabsList className="bg-transparent h-12 gap-1">
                        <RoomTab value="chat" icon={<MessageSquare className="w-4 h-4" />} label="Chat" />
                        {capabilities.disagreements && (
                            <RoomTab
                                value="disagreements"
                                icon={<AlertTriangle className="w-4 h-4" />}
                                label="Disagreements"
                                count={disagreements.length}
                                tone="red"
                                anchor="room.tab.disagreements"
                            />
                        )}
                        {capabilities.consensus && (
                            <RoomTab
                                value="consensus"
                                icon={<CheckCircle2 className="w-4 h-4" />}
                                label="Consensus"
                                count={consensus.length}
                                tone="green"
                                anchor="room.tab.consensus"
                            />
                        )}
                        <RoomTab value="roster" icon={<Users className="w-4 h-4" />} label="Roster" />
                        {capabilities.documents && DocumentsPanel && (
                            <RoomTab
                                value="documents"
                                icon={<FileText className="w-4 h-4" />}
                                label={runtime.replay ? "Files" : "Shared Docs"}
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
                    <div className="mx-4 mt-4 p-3 bg-warning-soft border border-warning/60 rounded-lg flex items-center gap-2 text-warning shrink-0">
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
                    <TabsContent
                        value="disagreements"
                        className="flex-1 m-0 min-h-0 flex flex-col"
                    >
                        <div className="min-h-0 flex-1">
                            <DisagreementsPanel disagreements={disagreements} />
                        </div>
                    </TabsContent>
                )}

                {capabilities.consensus && (
                    <TabsContent
                        value="consensus"
                        className="flex-1 m-0 min-h-0 flex flex-col"
                    >
                        <div className="min-h-0 flex-1">
                            <ConsensusPanel consensus={consensus} />
                        </div>
                    </TabsContent>
                )}

                <TabsContent value="roster" className="flex-1 m-0 min-h-0">
                    <ParticipantRoster participants={meeting.participants ?? []} />
                </TabsContent>

                {capabilities.documents && DocumentsPanel && (
                    <TabsContent
                        value="documents"
                        className="flex-1 m-0 min-h-0 overflow-y-auto"
                    >
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
                                        runtime.closingStream && !skipClosingText
                                            ? recordedClosingText
                                            : undefined
                                    }
                                    onSkipText={() => {
                                        setSkippedClosingCheckpoint(
                                            replayCheckpoint ?? null
                                        );
                                        // Skipping the text is a playback
                                        // choice, but it must still settle the
                                        // canonical closing intent so the guide
                                        // reaches Archive.
                                        if (replayClosing && runtime.replay) {
                                            void runtime.replay
                                                .skipIntent(
                                                    replayClosing.intent_id
                                                )
                                                .catch(() => {
                                                    // The snapshot text remains
                                                    // usable even if settlement
                                                    // could not be recorded.
                                                });
                                        }
                                    }}
                                    onReplayClosing={
                                        replayClosing ? replayClosingTurn : undefined
                                    }
                                />
                                {runtime.replay && ended && (
                                    <div className="mt-4 flex justify-center">
                                        <Button asChild variant="outline">
                                            <Link
                                                ref={returnRef}
                                                href="/demo/meetings"
                                            >
                                                Go to meetings
                                            </Link>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>
                )}
            </Tabs>

            {closingOpen ? (
                tab !== 'closing' ? (
                    <ClosingRoomNotice stage={closingStage} onOpen={openClosing} />
                ) : null
            ) : (
                <>
                    {capabilities.closing && !ended && (
                        <div className="border-t border-separator bg-canvas px-4 py-2 shrink-0">
                            <div className="mx-auto flex max-w-3xl items-center justify-end gap-2">
                                {runtime.replay?.preparedTurns?.length &&
                                !runtime.replay.canClose ? (
                                    <span className="text-xs text-ink-muted">
                                        {runtime.replay.closeReason}
                                    </span>
                                ) : null}
                                <Button
                                    ref={closeAnchorRef}
                                    id="closing-entry"
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-ink-secondary hover:text-ink"
                                    disabled={
                                        runtime.replay?.preparedTurns?.length
                                            ? !runtime.replay.canClose
                                            : false
                                    }
                                    onClick={openClosing}
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Close meeting
                                </Button>
                            </div>
                        </div>
                    )}
                    {!ended ? <RoomControls meeting={meeting} turns={turns} /> : null}
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
            className="border-t border-separator bg-canvas px-4 py-3 shrink-0"
        >
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{title}</p>
                    <p className="text-xs text-ink-muted">{detail}</p>
                </div>
                <Button
                    id="closing-room-view"
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-control text-ink-secondary"
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
    anchor,
}: {
    id?: string;
    value: string;
    icon: React.ReactNode;
    label: string;
    count?: number;
    tone?: 'red' | 'green';
    anchor?: TutorialAnchorId;
}) {
    const ref = useAnchorRef(anchor ?? null);
    return (
        <TabsTrigger
            ref={ref}
            id={id}
            value={value}
            className="data-[state=active]:bg-surface-raised data-[state=active]:text-ink text-ink-secondary px-3"
        >
            {icon}
            <span className="ml-2">{label}</span>
            {count !== undefined && count > 0 && (
                <Badge
                    variant="secondary"
                    className={cn(
                        'ml-2 h-5 px-1.5 text-xs',
                        tone === 'red'
                            ? 'bg-danger-soft text-danger'
                            : 'bg-success-soft text-success'
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
    const contentRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);
    const messageCount = meeting.messages?.length ?? 0;

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
        const viewport = contentRef.current?.closest<HTMLElement>(
            '[data-slot="scroll-area-viewport"]'
        );
        if (!viewport) return;

        // Scroll only the message viewport, and jump instead of animating.
        // scrollIntoView used to move the whole demo page while a turn streamed.
        viewport.scrollTop = viewport.scrollHeight;
    }, [messageCount, projection]);

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
                    <div className="text-center py-12 text-ink-muted">
                        <p>No messages yet. Start the conversation!</p>
                    </div>
                )}
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
    const speakerRef = useAnchorRef('room.speaker');
    const ParticipantAction = runtime.slots.participantAction;
    const DirectorAction = runtime.slots.directorAction;

    const handleStartTurn = (
        participantId: string,
        settings?: Parameters<typeof turns.submit>[1]
    ) => {
        void turns.submit(participantId, settings);
    };

    const nonTerminal = turns.operations.filter((operation) => !isTerminal(operation.status));

    return (
        <div className="p-4 border-t border-separator shrink-0 bg-canvas">
            <div
                className="max-w-3xl mx-auto max-h-[55dvh] overflow-y-auto pr-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                role="group"
                aria-label="Meeting controls"
                tabIndex={0}
            >
                <p className="text-xs text-ink-secondary mb-3">Who speaks next?</p>
                <div ref={speakerRef} className="flex flex-wrap gap-2 mb-4">
                    {runtime.replay ? (
                        runtime.replay.preparedTurns?.length ? null : (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span
                                        tabIndex={0}
                                        data-testid="you-disabled-trigger"
                                        className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                    >
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled
                                            className="border-action/50 bg-accent-soft text-ink-muted"
                                        >
                                            <User className="w-4 h-4 mr-1" />
                                            You
                                        </Button>
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                    Only available in the live workspace.
                                </TooltipContent>
                            </Tooltip>
                        )
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-control hover:bg-surface-raised bg-accent-soft border-action text-action"
                        >
                            <User className="w-4 h-4 mr-1" />
                            You
                        </Button>
                    )}
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

                {DirectorAction ? <DirectorAction /> : null}

                <PreparedTurnControls
                    activeOperationId={turns.activeOperation?.operation_id}
                />
                <div className="mb-3 flex justify-end">
                    <ReplaySpeedControl />
                </div>

                {nonTerminal.length > 0 && (
                    <div className="mb-4 rounded-lg border border-separator bg-surface/60 divide-y divide-separator">
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
    const runtime = useMeetingsRuntime();
    const participant = (meeting.participants ?? []).find(
        (item) => item.id === operation.participant_id
    );
    const isExecuting = operation.status === 'executing';
    const isCanceling =
        turns.cancelingOperationId === operation.operation_id || operation.cancel_requested;

    return (
        <div className="flex items-center gap-2 px-3 py-2 text-xs">
            {isExecuting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-action" />
            ) : (
                <Clock className="w-3.5 h-3.5 text-ink-muted" />
            )}
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: participant?.color }}
                />
                {participant?.name ?? 'Participant'}
            </span>
            <span className="text-ink-muted">
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
                    <button onClick={turns.resumeObservation} className="text-action hover:underline">
                        Resume observation
                    </button>
                )}
            {runtime.capabilities.cancelTurn ? (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-ink-secondary hover:text-danger"
                    disabled={isCanceling}
                    onClick={() => void turns.cancel(operation.operation_id)}
                    aria-label={`Cancel ${participant?.name ?? 'turn'}`}
                >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    {isCanceling ? 'Canceling' : 'Cancel'}
                </Button>
            ) : null}
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
                    className="bg-surface-raised border-control text-ink placeholder:text-ink-muted"
                />
                <Button
                    onClick={() => void handleSend()}
                    disabled={!inputValue.trim() || sendMessage.isPending}
                    aria-label="Send message"
                    className="bg-action hover:bg-action-hover"
                >
                    {sendMessage.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Send className="w-4 h-4" />
                    )}
                </Button>
            </div>
            {sendMessage.isError && (
                <p className="mt-2 text-xs text-danger">
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
                <h2
                    id="disagreements-heading"
                    tabIndex={-1}
                    className="sr-only"
                >
                    Disagreements
                </h2>
                {disagreements.length === 0 ? (
                    <EmptyTab
                        icon={<AlertTriangle className="w-12 h-12" />}
                        title="No Disagreements Yet"
                        text="When AI participants disagree, their debates will appear here."
                    />
                ) : (
                    <div className="space-y-4">
                        <p className="text-sm text-ink-secondary mb-4">
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
                <h2 id="consensus-heading" tabIndex={-1} className="sr-only">
                    Consensus
                </h2>
                {consensus.length === 0 ? (
                    <EmptyTab
                        icon={<CheckCircle2 className="w-12 h-12" />}
                        title="No Consensus Yet"
                        text="When AI participants reach agreement, it will appear here."
                    />
                ) : (
                    <div className="space-y-4">
                        <p className="text-sm text-ink-secondary mb-4">
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
        <div className="text-center py-16 text-ink-muted">
            <div className="mx-auto mb-3 opacity-50 w-12 h-12">{icon}</div>
            <h3 className="text-lg font-medium text-ink-secondary mb-1">{title}</h3>
            <p className="text-sm">{text}</p>
        </div>
    );
}

function DisagreementCard({ disagreement }: { disagreement: Disagreement }) {
    const severityColors: Record<number, string> = {
        1: 'border-warning/50 bg-warning-soft',
        2: 'border-warning/50 bg-warning-soft',
        3: 'border-danger/50 bg-danger-soft',
        4: 'border-danger/50 bg-danger-soft',
        5: 'border-danger/50 bg-danger-soft',
    };
    const severity = (disagreement.severity || 3) as keyof typeof severityColors;
    return (
        <Card className={cn('p-4 border', severityColors[severity])}>
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <h4 className="font-medium text-ink">{disagreement.topic}</h4>
                    <Badge
                        variant="secondary"
                        className={cn(
                            'shrink-0 text-xs',
                            disagreement.status === 'open'
                                ? 'bg-danger-soft text-danger'
                                : 'bg-surface-selected text-ink-secondary'
                        )}
                    >
                        {disagreement.status}
                    </Badge>
                </div>
                <p className="text-sm text-ink-secondary">{disagreement.reasoning}</p>
                <div className="flex items-center gap-3 text-xs text-ink-muted">
                    <span>
                        Challenging:{' '}
                        <span className="text-ink-secondary">{disagreement.target_name}</span>
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
        1: 'border-success/40 bg-success-soft',
        2: 'border-success/40 bg-success-soft',
        3: 'border-success/50 bg-success-soft',
        4: 'border-success/50 bg-success-soft',
        5: 'border-success/50 bg-success-soft',
    };
    const strength = (consensus.strength || 3) as keyof typeof strengthColors;
    return (
        <Card className={cn('p-4 border', strengthColors[strength])}>
            <div className="space-y-3">
                <h4 className="font-medium text-ink">{consensus.topic}</h4>
                <div className="flex flex-wrap gap-2">
                    {(consensus.participants as string[]).map((name, index) => (
                        <Badge
                            key={`${name}-${index}`}
                            variant="secondary"
                            className="text-xs bg-success-soft text-success"
                        >
                            {name}
                        </Badge>
                    ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-ink-muted">
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
                    <h3 className="text-lg font-semibold text-ink mb-1">AI Roster</h3>
                    <p className="text-sm text-ink-secondary">
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
    const runtime = useMeetingsRuntime();
    const stackLabels = runtime.replay?.stackLabels ?? {};
    const [promptOpen, setPromptOpen] = useState(false);
    const [knowledgeOpen, setKnowledgeOpen] = useState(false);
    const stackCount = participant.stack_ids?.length ?? 0;

    return (
        <Card className="bg-surface/50 border-separator overflow-hidden">
            <div className="p-4 flex items-start gap-4">
                <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold"
                    style={{
                        backgroundColor: participant.color,
                        color: readableTextOn(participant.color),
                    }}
                >
                    {participant.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-ink">{participant.name}</h4>
                        <Badge
                            variant="secondary"
                            className="border text-xs capitalize text-ink"
                            style={{
                                backgroundColor: `${participant.color}20`,
                                borderColor: participant.color,
                            }}
                        >
                            {participant.role}
                        </Badge>
                    </div>
                    <p className="type-meta text-ink-muted">
                        Model: {participant.provider_config?.model || 'Default'}
                    </p>
                </div>
            </div>
            <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="w-full justify-between px-4 py-2 h-auto text-sm text-ink-secondary hover:text-ink hover:bg-surface-raised rounded-none border-t border-separator"
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
                    <div className="px-4 py-3 bg-canvas/50 border-t border-separator">
                        <pre className="text-xs text-ink-secondary whitespace-pre-wrap font-mono leading-relaxed">
                            {participant.system_prompt}
                        </pre>
                    </div>
                </CollapsibleContent>
            </Collapsible>
            <Collapsible open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="w-full justify-between px-4 py-2 h-auto text-sm text-ink-secondary hover:text-ink hover:bg-surface-raised rounded-none border-t border-separator"
                    >
                        <span className="flex items-center gap-2">
                            <Lock className="w-4 h-4" />
                            Knowledge assignments
                            <Badge variant="secondary" className="text-xs bg-surface-raised text-ink-secondary">
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
                    <div className="px-4 py-3 bg-canvas/50 border-t border-separator">
                        {stackCount === 0 ? (
                            <p className="text-xs text-ink-muted italic">
                                No knowledge stacks linked to this AI.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {participant.stack_ids?.map((stackId) => (
                                    <li key={stackId} className="flex items-center gap-2 text-sm">
                                        <FileText className="w-4 h-4 text-ink-muted" />
                                        <span className="text-ink-secondary">
                                            {stackLabels[stackId] ?? "Unlabeled knowledge stack"}
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
        <aside className="w-72 border-l border-separator bg-canvas p-4 overflow-y-auto shrink-0 hidden lg:block">
            <h3 className="text-sm font-semibold text-ink mb-3">Meeting Info</h3>
            <div className="space-y-2 text-xs text-ink-secondary mb-6">
                <div className="flex justify-between">
                    <span>Participants</span>
                    <span className="text-ink">{meeting.participants?.length ?? 0}</span>
                </div>
                <div className="flex justify-between">
                    <span>Messages</span>
                    <span className="text-ink">{meeting.messages?.length ?? 0}</span>
                </div>
                <div className="flex justify-between">
                    <span>Disagreements</span>
                    <span className="text-ink">{disagreements.length}</span>
                </div>
                <div className="flex justify-between">
                    <span>Consensus</span>
                    <span className="text-ink">{consensus.length}</span>
                </div>
                {meeting.total_cost > 0 && (
                    <div className="flex justify-between">
                        <span>Cost</span>
                        <span className="text-ink">{formatCost(meeting.total_cost)}</span>
                    </div>
                )}
            </div>

            {contextStats && (
                <div className="mb-6">
                    <h4 className="text-xs font-medium text-ink-secondary mb-2">Context Usage</h4>
                    <div className="h-2 rounded-full bg-surface-raised overflow-hidden">
                        <div
                            className={cn(
                                'h-full rounded-full',
                                contextStats.usage_percent > 80
                                    ? 'bg-danger'
                                    : contextStats.usage_percent > 60
                                      ? 'bg-warning'
                                      : 'bg-success'
                            )}
                            style={{
                                width: `${Math.min(contextStats.usage_percent, 100)}%`,
                            }}
                        />
                    </div>
                    <p className="text-xs text-ink-muted mt-1">
                        {contextStats.current_tokens.toLocaleString()} /{' '}
                        {contextStats.max_tokens.toLocaleString()} tokens
                    </p>
                </div>
            )}

            <h4 className="text-xs font-medium text-ink-secondary mb-2">Participants</h4>
            <div className="space-y-2">
                {(meeting.participants ?? []).map((participant) => (
                    <div
                        key={participant.id}
                        className="flex items-center gap-2 rounded-lg border border-separator bg-surface/50 p-2"
                    >
                        <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                            style={{
                                backgroundColor: participant.color,
                                color: readableTextOn(participant.color),
                            }}
                        >
                            {participant.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate type-meta text-ink">
                                {participant.name}
                            </p>
                            <p className="truncate type-meta capitalize text-ink-muted">
                                {participant.role}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}

function renderCitationPreview(citation: CitationView) {
    return <EvidenceCitationTrigger citation={citation} />;
}

function MessageBubble({
    message,
    participant,
}: {
    message: Message;
    participant?: AIParticipant;
}) {
    const runtime = useMeetingsRuntime();
    const isUser = message.sender_type === 'user';
    const isSystem = message.sender_type === 'system';
    const toolCalls =
        (message.tool_artifacts as { tool_calls?: Array<{ tool: string; result: string }> })
            ?.tool_calls || [];

    return (
        <div
            data-testid="message"
            data-message-id={message.id}
            data-sender-type={message.sender_type}
            data-sender-name={message.sender_name}
            className={cn('flex gap-3', isUser && 'flex-row-reverse')}
        >
            <div
                className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                    isUser && 'bg-action',
                    isSystem && 'bg-surface-selected'
                )}
                style={
                    participant
                        ? {
                              backgroundColor: participant.color,
                              color: readableTextOn(participant.color),
                          }
                        : undefined
                }
            >
                {isUser ? (
                    <User className="h-4 w-4 text-action-foreground" />
                ) : isSystem ? (
                    <Bot className="h-4 w-4 text-ink-secondary" />
                ) : (
                    <span className="text-sm font-bold">
                        {message.sender_name.charAt(0)}
                    </span>
                )}
            </div>
            <div className={cn('flex-1 max-w-[80%]', isUser && 'flex flex-col items-end')}>
                <div className="flex items-center gap-2 mb-1">
                    <span
                        className={cn(
                            'inline-flex items-center gap-1.5 text-sm font-medium',
                            isUser ? 'text-action' : 'text-ink'
                        )}
                    >
                        {!isUser && !isSystem && participant ? (
                            <span
                                aria-hidden="true"
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: participant.color }}
                            />
                        ) : null}
                        {message.sender_name}
                    </span>
                    <span className="text-xs text-ink-muted">
                        {formatRelativeTime(message.created_at)}
                    </span>
                    {message.estimated_cost > 0 && (
                        <Badge variant="secondary" className="text-xs bg-surface-raised text-ink-secondary">
                            {formatCost(message.estimated_cost)}
                        </Badge>
                    )}
                </div>
                {message.thinking_content && (
                    <ThinkingBlock
                        content={message.thinking_content}
                        isStreaming={false}
                        provenance={runtime.replay ? 'Prepared reasoning' : undefined}
                    />
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
                            ? 'bg-action text-action-foreground rounded-br-md'
                            : 'bg-surface-raised text-ink rounded-bl-md',
                        isSystem && 'bg-surface-raised/50 text-ink-secondary italic'
                    )}
                >
                    {isUser || isSystem ? (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    ) : (
                        <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-surface-raised prose-pre:text-ink-secondary prose-code:bg-surface-raised prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-action prose-code:before:content-none prose-code:after:content-none">
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
                            claim_id: citation.claim_id ?? undefined,
                            locator: citation.locator ?? undefined,
                            document_id: citation.document_id ?? undefined,
                            revision_id: citation.revision_id ?? undefined,
                            chunk_id: citation.chunk_id ?? undefined,
                            chunk_index: citation.chunk_index ?? undefined,
                            page_number: citation.page_number ?? undefined,
                        }))}
                        renderPreviewAction={runtime.evidence ? renderCitationPreview : undefined}
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
    const runtime = useMeetingsRuntime();
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
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: color, color: readableTextOn(color) }}
            >
                <span className="text-sm font-bold">{name.charAt(0)}</span>
            </div>
            <div className="flex-1 max-w-[80%]">
                <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                        <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                        />
                        {name}
                    </span>
                    {isQueued ? (
                        <Badge variant="secondary" className="text-xs bg-surface-raised text-ink-secondary">
                            <Clock className="w-3 h-3 mr-1" />
                            Queued
                            {operation.queue_position ? ` #${operation.queue_position}` : ''}
                        </Badge>
                    ) : (
                        <Loader2 className="w-3 h-3 animate-spin text-ink-muted" />
                    )}
                    {!isQueued && isObserving && (
                        <span className="text-xs text-ink-muted">
                            {runtime.replay ? "recording" : "live"}
                        </span>
                    )}
                </div>

                {projection?.thinking && (
                    <ThinkingBlock
                        content={projection.thinking}
                        isStreaming={!projection.terminal && !projection.observationInterrupted}
                        provenance={runtime.replay ? 'Prepared reasoning' : undefined}
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
                    <div className="rounded-2xl px-4 py-2.5 bg-surface-raised text-ink rounded-bl-md">
                        <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-surface-raised prose-pre:text-ink-secondary prose-code:bg-surface-raised prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-action prose-code:before:content-none prose-code:after:content-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {projection.text}
                            </ReactMarkdown>
                            {!projection.terminal && !projection.observationInterrupted && (
                                <span className="inline-block w-2 h-4 ml-1 bg-ink-muted animate-pulse" />
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
                            claim_id: citation.claimId ?? undefined,
                            locator: citation.locator ?? undefined,
                            document_id: citation.documentId ?? undefined,
                            revision_id: citation.revisionId ?? undefined,
                            chunk_id: citation.chunkId ?? undefined,
                            chunk_index: citation.chunkIndex ?? undefined,
                            page_number: citation.pageNumber ?? undefined,
                        }))}
                        renderPreviewAction={runtime.evidence ? renderCitationPreview : undefined}
                    />
                )}

                {projection?.error && (
                    <div className="mt-2 rounded-lg border border-danger/60 bg-danger-soft px-3 py-2 text-sm text-danger">
                        {projection.error.message}
                    </div>
                )}

                {projection?.observationInterrupted && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-warning/60 bg-warning-soft px-3 py-2 text-xs text-warning">
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
                    <div className="rounded-2xl px-4 py-2.5 bg-surface-raised text-ink-muted rounded-bl-md">
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
