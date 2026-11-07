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
    PanelRight,
    Scroll,
    Send,
    Users,
    XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ParticipantMark, DirectorMark } from '@/components/identity/participant-mark';
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
import { PreparedTurnControls } from '../runtime/playback-controls';
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
    RoomTutorialInline,
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
    /** Runtime-owned utility actions shown in the room header. */
    headerActions?: React.ReactNode;
}

const TERMINAL_STATUSES = ['completed', 'failed', 'interrupted', 'cancelled'];

function isTerminal(status: string): boolean {
    return TERMINAL_STATUSES.includes(status);
}

function meetingStatusTone(
    status: string
): 'success' | 'warning' | 'neutral' {
    if (status === 'active') return 'success';
    if (status === 'voting') return 'warning';
    return 'neutral';
}

function meetingStatusLabel(status: string): string {
    switch (status) {
        case 'active':
            return 'Active';
        case 'voting':
            return 'Voting';
        case 'ended':
            return 'Ended';
        case 'archived':
            return 'Archived';
        default:
            return status;
    }
}

export function MeetingRoom({
    meetingId,
    initialTab,
    activeTab,
    onTabChange,
    headerActions,
}: MeetingRoomProps) {
    const runtime = useMeetingsRuntime();
    const meetingQuery = useRuntimeMeeting(meetingId);
    const disagreementsQuery = useRuntimeDisagreements(meetingId);
    const consensusQuery = useRuntimeConsensus(meetingId);
    const contextStatsQuery = useRuntimeContextStats(meetingId);
    const recordAvailable =
        (disagreementsQuery.data?.length ?? 0) > 0 ||
        (consensusQuery.data?.length ?? 0) > 0;
    const recordSettled =
        !disagreementsQuery.isLoading && !consensusQuery.isLoading;

    useEffect(() => {
        if (recordSettled && !recordAvailable) {
            if (activeTab === 'disagreements' || activeTab === 'consensus') {
                onTabChange?.('chat');
            }
        }
    }, [activeTab, onTabChange, recordAvailable, recordSettled]);

    if (!meetingId) {
        return <RoomNotice text="No meeting selected." />;
    }
    if (meetingQuery.isPending) {
        return (
            <main
                id="main-content"
                className="h-full min-h-0 bg-canvas flex items-center justify-center"
             tabIndex={-1}>
                <Loader2 className="w-8 h-8 animate-spin text-ink-muted" />
            </main>
        );
    }
    if (meetingQuery.isError || !meetingQuery.data) {
        return (
            <main
                id="main-content"
                className="h-full min-h-0 bg-canvas flex flex-col items-center justify-center gap-3 text-ink-secondary"
             tabIndex={-1}>
                <AlertTriangle className="w-8 h-8 text-warning" />
                <p>This meeting could not be loaded.</p>
                <Button variant="outline" onClick={() => void meetingQuery.refetch()}>
                    Try again
                </Button>
            </main>
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
        <main
            id="main-content"
            className="flex h-full min-h-0 flex-col overflow-hidden"
            tabIndex={-1}
        >
            <MeetingConversation
                meeting={meeting}
                disagreements={disagreementsQuery.data ?? []}
                consensus={consensusQuery.data ?? []}
                contextStats={contextStatsQuery.data}
                recordAvailable={recordAvailable}
                initialTab={initialTab}
                activeTab={activeTab}
                onTabChange={onTabChange}
                headerActions={headerActions}
            />
        </main>
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
    contextStats?: ContextStats;
    recordAvailable: boolean;
    initialTab?: string;
    activeTab?: string;
    onTabChange?: (tab: string) => void;
    headerActions?: React.ReactNode;
}

function RecordToggle({
    available,
    expanded,
    onToggle,
    mobile = false,
}: {
    available: boolean;
    expanded: boolean;
    onToggle: () => void;
    mobile?: boolean;
}) {
    const button = (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('text-ink-secondary', mobile ? 'lg:hidden' : 'hidden lg:inline-flex')}
            disabled={!available}
            onClick={onToggle}
            aria-expanded={available ? expanded : undefined}
            aria-controls={available ? 'room-record' : undefined}
        >
            <PanelRight className="mr-2 h-4 w-4" />
            {mobile ? 'Record' : 'Meeting record'}
        </Button>
    );

    if (available) return button;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    tabIndex={0}
                    data-testid={mobile ? 'record-disabled-trigger-mobile' : 'record-disabled-trigger'}
                    className={cn(
                        'rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                        mobile ? 'inline-flex lg:hidden' : 'hidden lg:inline-flex'
                    )}
                >
                    {button}
                </span>
            </TooltipTrigger>
            <TooltipContent side="top">
                No meeting record yet. Disagreements and consensus appear here as the
                meeting unfolds.
            </TooltipContent>
        </Tooltip>
    );
}

function MeetingConversation({
    meeting,
    disagreements,
    consensus,
    contextStats,
    recordAvailable,
    initialTab,
    activeTab,
    onTabChange,
    headerActions,
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
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [recordOpen, setRecordOpen] = useState(false);
    const [recordOverlayOpen, setRecordOverlayOpen] = useState(false);
    const [recordTabState, setRecordTabState] = useState<'disagreements' | 'consensus'>(
        'disagreements'
    );
    /**
     * A routable room is controlled by its URL. The URL is the only owner of
     * the visible tab, so the tutorial and the room cannot disagree about
     * which evidence is on screen. The live room keeps its local fallback.
     */
    const tab = activeTab ?? localTab;
    const mainTab = tab === 'disagreements' || tab === 'consensus' ? 'chat' : tab;
    const recordTab =
        tab === 'disagreements' || tab === 'consensus' ? tab : recordTabState;
    const setTab = (next: string) => {
        if (activeTab === undefined) setLocalTab(next);
        onTabChange?.(next);
    };
    const setRecordTab = (next: string) => {
        if (next === 'disagreements' || next === 'consensus') {
            setRecordTabState(next);
            setRecordOpen(true);
            setRecordOverlayOpen(true);
            setTab(next);
        }
    };
    const openRecord = () => {
        setRecordOpen(true);
        if (tab !== 'disagreements' && tab !== 'consensus') {
            setRecordOverlayOpen(true);
        }
    };
    const closeRecord = () => {
        setRecordOpen(false);
        setRecordOverlayOpen(false);
        if (tab === 'disagreements' || tab === 'consensus') setTab('chat');
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
    const closeReason =
        runtime.replay?.preparedTurns?.length && !runtime.replay.canClose
            ? runtime.replay.closeReason
            : null;
    const recordVisible =
        recordAvailable &&
        (recordOpen || tab === 'disagreements' || tab === 'consensus');
    const recordOverlayVisible =
        recordOverlayOpen || tab === 'disagreements' || tab === 'consensus';
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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
            <header className="material-chrome relative z-chrome shrink-0 border-b border-separator px-3 py-2.5 sm:px-4">
                <div className="flex items-start gap-2 sm:gap-3">
                    <Link
                        href={runtime.presentation.homeHref}
                        className="m-control mt-0.5 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-control px-2 type-control text-ink-secondary outline-none hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        aria-label="Back to meetings"
                    >
                        <ArrowLeft aria-hidden="true" className="size-4" />
                        <span className="hidden sm:inline">Meetings</span>
                    </Link>
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h1
                                className="line-clamp-1 min-w-0 type-room-title text-balance text-ink"
                                title={meeting.name}
                            >
                                {meeting.name}
                            </h1>
                            <StatusBadge
                                tone={meetingStatusTone(meeting.status)}
                            >
                                {meetingStatusLabel(meeting.status)}
                            </StatusBadge>
                            <Badge variant="outline">
                                {runtime.replay
                                    ? 'Recorded demo'
                                    : 'Operator'}
                            </Badge>
                        </div>
                        {meeting.agenda ? (
                            <details className="group mt-0.5 max-w-[90ch]">
                                <summary className="m-control cursor-pointer truncate type-meta text-ink-secondary marker:text-ink-muted group-open:whitespace-normal group-open:type-body group-open:text-ink">
                                    {meeting.agenda}
                                </summary>
                            </details>
                        ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                        {headerActions}
                        {runtime.restart && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-ink-secondary"
                                onClick={runtime.restart}
                            >
                                Restart
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setDetailsOpen(true)}
                        >
                            Details
                        </Button>
                        {capabilities.closing && !ended && (
                            <Button
                                ref={closeAnchorRef}
                                id="closing-tab"
                                data-testid="closing-entry"
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={openClosing}
                                disabled={Boolean(closeReason)}
                                aria-label={
                                    closeReason
                                        ? `Close meeting. ${closeReason}`
                                        : 'Close meeting'
                                }
                                title={closeReason ?? undefined}
                            >
                                <LogOut
                                    aria-hidden="true"
                                    className="mr-2 size-4"
                                />
                                Close
                            </Button>
                        )}
                    </div>
                </div>
            </header>

            <div
                data-testid="room-work-area"
                className="flex min-h-0 flex-1 flex-col"
            >
                <div className="relative flex min-h-0 flex-1 overflow-hidden">
                <Tabs
                    value={mainTab}
                    onValueChange={setTab}
                    className="flex min-w-0 flex-1 flex-col"
                >
                    <div className="material-chrome relative z-10 flex shrink-0 items-center gap-2 border-b border-separator px-3 py-1.5">
                        <TabsList className="h-auto min-w-0 flex-none justify-start gap-1 bg-transparent p-0">
                            <RoomTab
                                value="chat"
                                icon={<MessageSquare className="h-[18px] w-[18px]" />}
                                label="Chat"
                            />
                            <RoomTab
                                value="roster"
                                icon={<Users className="h-[18px] w-[18px]" />}
                                label="Personas"
                            />
                            {capabilities.documents && DocumentsPanel && (
                                <RoomTab
                                    value="documents"
                                    icon={<FileText className="h-[18px] w-[18px]" />}
                                    label={runtime.replay ? 'Files' : 'Shared Docs'}
                                />
                            )}
                            {capabilities.summary && SummaryPanel && (
                                <RoomTab
                                    value="summary"
                                    icon={<Scroll className="h-[18px] w-[18px]" />}
                                    label="Summary"
                                />
                            )}
                        </TabsList>
                        <RecordToggle
                            available={recordAvailable}
                            expanded={recordVisible}
                            onToggle={recordVisible ? closeRecord : openRecord}
                        />
                        <RecordToggle
                            available={recordAvailable}
                            expanded={recordOverlayOpen}
                            onToggle={openRecord}
                            mobile
                        />
                    </div>

                    {turns.actionError && (
                        <div
                            role="alert"
                            className="mx-3 mt-3 flex shrink-0 items-center gap-2 rounded-control border border-warning/60 bg-warning-soft p-3 type-meta text-warning"
                        >
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span className="flex-1">{turns.actionError}</span>
                            <button
                                onClick={turns.clearActionError}
                                className="underline underline-offset-2"
                            >
                                Dismiss
                            </button>
                        </div>
                    )}

                    <TabsContent
                        value="chat"
                        data-testid="room-chat-surface"
                        className="m-0 flex min-h-0 flex-1 flex-col bg-surface/70"
                    >
                        <MessageList
                            meeting={meeting}
                            activeOperation={turns.activeOperation}
                            projection={turns.projection}
                            isObserving={turns.isObserving}
                            onResume={turns.resumeObservation}
                        />
                    </TabsContent>

                    <TabsContent value="roster" className="m-0 min-h-0 flex-1 bg-surface">
                        <ParticipantRoster participants={meeting.participants ?? []} />
                    </TabsContent>

                    {capabilities.documents && DocumentsPanel && (
                        <TabsContent
                            value="documents"
                            className="m-0 min-h-0 flex-1 overflow-y-auto bg-surface"
                        >
                            <DocumentsPanel meetingId={meeting.id} />
                        </TabsContent>
                    )}

                    {capabilities.summary && SummaryPanel && (
                        <TabsContent value="summary" className="m-0 min-h-0 flex-1 bg-surface">
                            <SummaryPanel meeting={meeting} />
                        </TabsContent>
                    )}

                    {capabilities.closing && (
                        <TabsContent value="closing" className="m-0 min-h-0 flex-1 bg-surface">
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

                {recordVisible && (
                    <aside
                        id="room-record"
                        className={cn(
                            'm-inspector flex min-h-0 flex-col border-separator bg-surface',
                            recordOverlayVisible
                                ? 'absolute inset-0 z-chrome flex lg:static lg:z-auto lg:w-80 lg:shrink-0 lg:border-l'
                                : 'hidden lg:flex lg:w-80 lg:shrink-0 lg:border-l'
                        )}
                    >
                        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-separator px-3 py-2">
                            <h2 className="type-item-title text-ink">Meeting record</h2>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="lg:hidden"
                                onClick={closeRecord}
                                aria-label="Back to discussion"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="hidden text-ink-secondary lg:inline-flex"
                                onClick={closeRecord}
                                aria-label="Close record rail"
                            >
                                <PanelRight className="h-4 w-4" />
                            </Button>
                        </div>
                        <Tabs
                            value={recordTab}
                            onValueChange={setRecordTab}
                            className="flex min-h-0 flex-1 flex-col"
                        >
                            <TabsList className="h-auto shrink-0 justify-start gap-1 border-b border-separator bg-transparent px-2 py-1">
                                {capabilities.disagreements && (
                                    <RoomTab
                                        value="disagreements"
                                        icon={<AlertTriangle className="h-[18px] w-[18px]" />}
                                        label="Disagreements"
                                        count={disagreements.length}
                                        tone="red"
                                        anchor="room.tab.disagreements"
                                    />
                                )}
                                {capabilities.consensus && (
                                    <RoomTab
                                        value="consensus"
                                        icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
                                        label="Consensus"
                                        count={consensus.length}
                                        tone="green"
                                        anchor="room.tab.consensus"
                                    />
                                )}
                            </TabsList>
                            {capabilities.disagreements && (
                                <TabsContent
                                    value="disagreements"
                                    className="m-0 flex min-h-0 flex-1 flex-col"
                                >
                                    <DisagreementsPanel
                                        disagreements={disagreements}
                                        participants={meeting.participants ?? []}
                                        compact
                                    />
                                </TabsContent>
                            )}
                            {capabilities.consensus && (
                                <TabsContent
                                    value="consensus"
                                    className="m-0 flex min-h-0 flex-1 flex-col"
                                >
                                    <ConsensusPanel consensus={consensus} compact />
                                </TabsContent>
                            )}
                        </Tabs>
                    </aside>
                )}
                </div>

                <div
                    data-testid="room-dock"
                    role="region"
                    aria-label="Meeting controls dock"
                    tabIndex={0}
                    className="max-h-[35dvh] shrink-0 overflow-y-auto border-t border-separator bg-surface px-4 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring lg:max-h-none lg:overflow-visible"
                >
                    <div className="mx-auto w-full max-w-[1120px]">
                        {closingOpen ? (
                            tab !== 'closing' ? (
                                <ClosingRoomNotice stage={closingStage} onOpen={openClosing} />
                            ) : null
                        ) : !ended ? (
                            <RoomControls meeting={meeting} turns={turns} />
                        ) : null}
                    </div>
                </div>
            </div>

            <MeetingDetailsDialog
                open={detailsOpen}
                onOpenChange={setDetailsOpen}
                meeting={meeting}
                disagreements={disagreements}
                consensus={consensus}
                contextStats={contextStats}
            />
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
            className={cn(
                'flex flex-wrap items-center gap-3 rounded-control border px-3 py-2',
                stage === 'failed'
                    ? 'border-danger/50 bg-danger-soft'
                    : 'border-warning/50 bg-warning-soft'
            )}
        >
            <div className="min-w-0 flex-1">
                <p className="type-control font-medium text-ink">{title}</p>
                <p className="type-meta text-ink-secondary">{detail}</p>
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
            className="m-state h-7 gap-1.5 rounded-control px-2.5 type-meta text-ink-secondary data-[state=active]:bg-surface-selected data-[state=active]:text-ink pointer-coarse:h-9"
        >
            {icon}
            <span>{label}</span>
            {count !== undefined && count > 0 && (
                <Badge
                    variant="secondary"
                    className={cn(
                        'h-5 px-1.5 text-xs',
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
    const messages = meeting.messages ?? [];
    const activeOperationId = activeOperation?.operation_id ?? null;
    const projectionVisible =
        Boolean(activeOperationId) &&
        !messages.some((message) => message.operation_id === activeOperationId);
    const [newContent, setNewContent] = useState(false);
    const previousCountRef = useRef(messageCount);
    const previousOperationRef = useRef(activeOperationId);

    useEffect(() => {
        const viewport = contentRef.current?.closest<HTMLElement>(
            '[data-slot="scroll-area-viewport"]'
        );
        if (!viewport) return;

        const updateStickiness = () => {
            const near = isNearScrollBottom(viewport);
            stickToBottomRef.current = near;
            if (near) setNewContent(false);
        };
        updateStickiness();
        viewport.addEventListener('scroll', updateStickiness, { passive: true });
        return () => viewport.removeEventListener('scroll', updateStickiness);
    }, []);

    useEffect(() => {
        const previousCount = previousCountRef.current;
        const previousOperation = previousOperationRef.current;
        previousCountRef.current = messageCount;
        previousOperationRef.current = activeOperationId;
        const grew =
            messageCount > previousCount ||
            (activeOperationId !== null &&
                activeOperationId !== previousOperation);
        if (!grew) return;

        const viewport = contentRef.current?.closest<HTMLElement>(
            '[data-slot="scroll-area-viewport"]'
        );
        if (!viewport) return;

        if (stickToBottomRef.current) {
            // Scroll only the message viewport, and jump instead of animating.
            viewport.scrollTop = viewport.scrollHeight;
            return;
        }
        // The reader is intentionally above the tail. Preserve that position
        // and offer an explicit way back instead of yanking them down.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNewContent(true);
    }, [activeOperationId, messageCount, projectionVisible]);

    const scrollToLatest = () => {
        const viewport = contentRef.current?.closest<HTMLElement>(
            '[data-slot="scroll-area-viewport"]'
        );
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
        stickToBottomRef.current = true;
        setNewContent(false);
    };

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <ScrollArea data-testid="room-discussion" className="min-h-0 flex-1">
                <div
                    ref={contentRef}
                    className="mx-auto max-w-[74ch] space-y-6 px-4 py-5"
                >
                    {messages.map((message) => (
                        <div
                            key={message.operation_id ?? message.id}
                            data-contribution-id={
                                message.operation_id ?? message.id
                            }
                        >
                            <MessageBubble
                                message={message}
                                participant={(meeting.participants ?? []).find(
                                    (p) => p.id === message.sender_id
                                )}
                            />
                        </div>
                    ))}

                    {projectionVisible && activeOperation && (
                        <div
                            key={activeOperation.operation_id}
                            data-contribution-id={activeOperation.operation_id}
                        >
                            <TurnProjectionBubble
                                operation={activeOperation}
                                projection={projection}
                                participant={(meeting.participants ?? []).find(
                                    (p) => p.id === activeOperation.participant_id
                                )}
                                isObserving={isObserving}
                                onResume={onResume}
                            />
                        </div>
                    )}

                    {messages.length === 0 && !activeOperation && (
                        <div className="py-12 text-center text-ink-muted">
                            <p>No messages yet. Start the conversation!</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
            {newContent ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="new-content"
                        className="pointer-events-auto bg-surface shadow-[var(--shadow-raised)]"
                        onClick={scrollToLatest}
                    >
                        New content
                        <ChevronDown aria-hidden="true" className="size-4" />
                    </Button>
                </div>
            ) : null}
        </div>
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
        <div className="space-y-1.5" role="group" aria-label="Meeting controls">
            <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="type-meta text-ink-secondary">Who speaks next?</p>
                        <RoomTutorialInline />
                    </div>
                    <div
                        ref={speakerRef}
                        role="group"
                        aria-label="Who speaks next?"
                        className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3"
                    >
                        {runtime.replay ? (
                            runtime.replay.preparedTurns?.length ? null : (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span
                                            tabIndex={0}
                                            data-testid="you-disabled-trigger"
                                            className="inline-flex rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                        >
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled
                                                className="w-full justify-start border-action/50 bg-accent-soft text-ink-muted"
                                            >
                                                <DirectorMark size="sm" />
                                                <span className="ml-1">You</span>
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
                                className="w-full justify-start border-action bg-accent-soft text-action hover:bg-surface-raised"
                            >
                                <DirectorMark size="sm" />
                                <span className="ml-1">You</span>
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
                                <div
                                    key={participant.id}
                                    className="flex min-w-0 flex-col gap-0.5"
                                >
                                    <ParticipantAction
                                        participant={participant}
                                        isActive={isActive}
                                        isQueued={isQueued}
                                        disabled={turns.isSubmitting}
                                        onStart={(settings) =>
                                            handleStartTurn(participant.id, settings)
                                        }
                                    />
                                    <span className="truncate px-1 type-meta capitalize text-ink-muted">
                                        {participant.role}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
            </div>
            {DirectorAction ? (
                <div className="min-w-0">
                    <DirectorAction />
                </div>
            ) : null}

            <div className="empty:hidden">
                <PreparedTurnControls
                    activeOperationId={turns.activeOperation?.operation_id}
                />
            </div>

            {nonTerminal.length > 0 && (
                <details className="rounded-control border border-separator bg-surface-raised/60">
                    <summary className="cursor-pointer px-3 py-2 type-meta text-ink-secondary">
                        {nonTerminal.length} operation
                        {nonTerminal.length === 1 ? '' : 's'} in progress
                    </summary>
                    <div className="divide-y divide-separator">
                        {nonTerminal.map((operation) => (
                            <QueueRow
                                key={operation.operation_id}
                                operation={operation}
                                meeting={meeting}
                                turns={turns}
                            />
                        ))}
                    </div>
                </details>
            )}

            {runtime.capabilities.sendMessage && (
                <MessageComposer meetingId={meeting.id} />
            )}
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
            <label htmlFor="room-composer" className="sr-only">
                Director message
            </label>
            <div className="flex items-end gap-2">
                <Textarea
                    id="room-composer"
                    rows={1}
                    value={inputValue}
                    onChange={(event) => input(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            void handleSend();
                        }
                    }}
                    placeholder="Type your message..."
                    aria-describedby="room-composer-hint"
                    className="max-h-32 min-h-10 resize-none bg-surface-raised border-control text-ink placeholder:text-ink-muted"
                />
                <Button
                    type="button"
                    onClick={() => void handleSend()}
                    busy={sendMessage.isPending}
                    busyLabel="Sending"
                    disabled={!inputValue.trim()}
                    aria-label="Send message"
                    className="bg-action hover:bg-action-hover"
                >
                    <Send aria-hidden="true" className="size-4" />
                </Button>
            </div>
            <p
                id="room-composer-hint"
                className="mt-1 type-meta text-ink-muted"
            >
                Enter to send · Shift+Enter for a new line
            </p>
            {sendMessage.isError && (
                <p role="alert" className="mt-2 type-meta text-danger">
                    The message was not saved. Your draft is still here; try
                    again.
                </p>
            )}
        </div>
    );
}

function DisagreementsPanel({
    disagreements,
    participants = [],
    compact = false,
}: {
    disagreements: Disagreement[];
    participants?: AIParticipant[];
    compact?: boolean;
}) {
    return (
        <ScrollArea className={cn('h-full', compact ? 'p-3' : 'p-4')}>
            <div className={cn('mx-auto', compact ? 'max-w-none' : 'max-w-3xl')}>
                <h2
                    id="disagreements-heading"
                    tabIndex={-1}
                    className="sr-only"
                >
                    Disagreements
                </h2>
                {disagreements.length === 0 ? (
                    <EmptyTab
                        compact={compact}
                        icon={<AlertTriangle className="h-8 w-8" />}
                        title="No disagreements yet"
                        text="When AI participants disagree, their debates will appear here."
                    />
                ) : (
                    <div className={compact ? 'space-y-2' : 'space-y-4'}>
                        <p className="mb-2 type-meta text-ink-secondary">
                            {disagreements.length} disagreement
                            {disagreements.length !== 1 ? 's' : ''} logged
                        </p>
                        {disagreements.map((disagreement) => (
                            <DisagreementCard
                                key={disagreement.id}
                                disagreement={disagreement}
                                participants={participants}
                                compact={compact}
                            />
                        ))}
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}

function ConsensusPanel({
    consensus,
    compact = false,
}: {
    consensus: Consensus[];
    compact?: boolean;
}) {
    return (
        <ScrollArea className={cn('h-full', compact ? 'p-3' : 'p-4')}>
            <div className={cn('mx-auto', compact ? 'max-w-none' : 'max-w-3xl')}>
                <h2 id="consensus-heading" tabIndex={-1} className="sr-only">
                    Consensus
                </h2>
                {consensus.length === 0 ? (
                    <EmptyTab
                        compact={compact}
                        icon={<CheckCircle2 className="h-8 w-8" />}
                        title="No consensus yet"
                        text="When AI participants reach agreement, it will appear here."
                    />
                ) : (
                    <div className={compact ? 'space-y-2' : 'space-y-4'}>
                        <p className="mb-2 type-meta text-ink-secondary">
                            {consensus.length} consensus point
                            {consensus.length !== 1 ? 's' : ''} reached
                        </p>
                        {consensus.map((item) => (
                            <ConsensusCard key={item.id} consensus={item} compact={compact} />
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
    compact = false,
}: {
    icon: React.ReactNode;
    title: string;
    text: string;
    compact?: boolean;
}) {
    return (
        <div
            className={cn(
                'text-center text-ink-muted',
                compact ? 'py-8' : 'py-16'
            )}
        >
            <div className="mx-auto mb-3 h-8 w-8 opacity-50">{icon}</div>
            <h3 className="mb-1 type-control font-medium text-ink-secondary">{title}</h3>
            <p className="type-meta">{text}</p>
        </div>
    );
}

function DisagreementCard({
    disagreement,
    participants,
    compact = false,
}: {
    disagreement: Disagreement;
    participants: AIParticipant[];
    compact?: boolean;
}) {
    const severity = Math.min(5, Math.max(1, disagreement.severity || 3));
    const source = participants.find(
        (participant) => participant.id === disagreement.source_ai_id
    );
    return (
        <details
            className={cn(
                'group material-raised rounded-control border border-separator',
                compact ? 'text-sm' : ''
            )}
        >
            <summary className="m-control flex cursor-pointer list-none items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h4 className="type-control font-semibold text-ink">
                            {disagreement.topic}
                        </h4>
                        <Badge variant="outline" className="capitalize">
                            {disagreement.status}
                        </Badge>
                    </div>
                    <p className="mt-1 type-meta text-ink-muted">
                        Severity {severity}/5 · Challenging{' '}
                        {disagreement.target_name}
                    </p>
                </div>
                <ChevronDown
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-ink-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                />
            </summary>
            <div className="space-y-3 border-t border-separator p-3">
                <p className="type-body text-ink-secondary">
                    {disagreement.reasoning}
                </p>
                <dl className="grid gap-2 type-meta sm:grid-cols-2">
                    <div>
                        <dt className="text-ink-muted">Logged by</dt>
                        <dd className="text-ink">
                            {source?.name ?? disagreement.source_ai_id}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-ink-muted">Challenging</dt>
                        <dd className="text-ink">{disagreement.target_name}</dd>
                    </div>
                    <div>
                        <dt className="text-ink-muted">Status</dt>
                        <dd className="capitalize text-ink">
                            {disagreement.status}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-ink-muted">Recorded</dt>
                        <dd className="text-ink">
                            {formatRelativeTime(disagreement.created_at)}
                        </dd>
                    </div>
                </dl>
            </div>
        </details>
    );
}

function ConsensusCard({
    consensus,
    compact = false,
}: {
    consensus: Consensus;
    compact?: boolean;
}) {
    const strength = Math.min(5, Math.max(1, consensus.strength || 3));
    return (
        <details
            className={cn(
                'group material-raised rounded-control border border-separator',
                compact ? 'text-sm' : ''
            )}
        >
            <summary className="m-control flex cursor-pointer list-none items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                    <h4 className="type-control font-semibold text-ink">
                        {consensus.topic}
                    </h4>
                    <p className="mt-1 type-meta text-ink-muted">
                        Strength {strength}/5 ·{' '}
                        {consensus.participants.length} participant
                        {consensus.participants.length === 1 ? '' : 's'}
                    </p>
                </div>
                <ChevronDown
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-ink-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                />
            </summary>
            <div className="space-y-3 border-t border-separator p-3">
                <ul className="flex flex-wrap gap-1.5">
                    {consensus.participants.map((name, index) => (
                        <li key={`${name}-${index}`}>
                            <Badge variant="secondary" className="text-xs">
                                {name}
                            </Badge>
                        </li>
                    ))}
                </ul>
                <dl className="grid gap-2 type-meta sm:grid-cols-2">
                    <div>
                        <dt className="text-ink-muted">Strength</dt>
                        <dd className="text-ink">{strength}/5</dd>
                    </div>
                    <div>
                        <dt className="text-ink-muted">Recorded</dt>
                        <dd className="text-ink">
                            {formatRelativeTime(consensus.created_at)}
                        </dd>
                    </div>
                </dl>
            </div>
        </details>
    );
}

function ParticipantRoster({ participants }: { participants: AIParticipant[] }) {
    return (
        <ScrollArea className="h-full p-4">
            <div className="mx-auto max-w-3xl space-y-4">
                <div className="mb-6">
                    <h2 className="type-section-title text-ink">
                        Participants
                    </h2>
                    <p className="mt-1 max-w-[68ch] type-body text-ink-secondary">
                        This is the participant snapshot saved with the meeting.
                        It is not the current editable persona template.
                    </p>
                </div>
                {participants.length === 0 ? (
                    <EmptyTab
                        icon={<Bot className="h-12 w-12" />}
                        title="No participants"
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
        <article className="material-raised overflow-hidden rounded-group">
            <div className="flex items-start gap-4 p-4">
                <ParticipantMark participant={participant} size="lg" />
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="type-item-title text-ink">
                            {participant.name}
                        </h3>
                        <Badge
                            variant="outline"
                            className="text-xs capitalize text-ink"
                            style={{
                                backgroundColor: `${participant.color}20`,
                                borderColor: participant.color,
                            }}
                        >
                            {participant.role}
                        </Badge>
                    </div>
                    <p className="break-words type-meta text-ink-muted">
                        Model:{' '}
                        <span className="text-ink-secondary">
                            {participant.provider_config?.model || 'Default'}
                        </span>
                    </p>
                    <p className="mt-0.5 type-meta text-ink-muted">
                        Saved with this meeting · persona{' '}
                        {participant.persona_id ?? 'snapshot'}
                    </p>
                </div>
            </div>
            <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="h-auto w-full justify-between rounded-none border-t border-separator px-4 py-2 text-sm text-ink-secondary hover:bg-surface-raised hover:text-ink"
                    >
                        <span className="flex items-center gap-2">
                            <Bot aria-hidden="true" className="size-4" />
                            Saved system prompt
                        </span>
                        {promptOpen ? (
                            <ChevronUp aria-hidden="true" className="size-4" />
                        ) : (
                            <ChevronDown aria-hidden="true" className="size-4" />
                        )}
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="max-h-72 overflow-auto border-t border-separator bg-canvas/50 px-4 py-3">
                        <pre className="whitespace-pre-wrap break-words type-body text-ink-secondary">
                            {participant.system_prompt}
                        </pre>
                    </div>
                </CollapsibleContent>
            </Collapsible>
            <Collapsible open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="h-auto w-full justify-between rounded-none border-t border-separator px-4 py-2 text-sm text-ink-secondary hover:bg-surface-raised hover:text-ink"
                    >
                        <span className="flex items-center gap-2">
                            <Lock aria-hidden="true" className="size-4" />
                            Knowledge assignments
                            <Badge
                                variant="secondary"
                                className="bg-surface-raised text-xs text-ink-secondary"
                            >
                                {stackCount} stack
                                {stackCount === 1 ? '' : 's'}
                            </Badge>
                        </span>
                        {knowledgeOpen ? (
                            <ChevronUp aria-hidden="true" className="size-4" />
                        ) : (
                            <ChevronDown aria-hidden="true" className="size-4" />
                        )}
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="border-t border-separator bg-canvas/50 px-4 py-3">
                        {stackCount === 0 ? (
                            <p className="type-meta italic text-ink-muted">
                                No knowledge stacks are assigned to this
                                participant. Shared meeting files are listed
                                separately.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {participant.stack_ids?.map((stackId) => (
                                    <li
                                        key={stackId}
                                        className="flex items-center gap-2 type-body"
                                    >
                                        <FileText
                                            aria-hidden="true"
                                            className="size-4 text-ink-muted"
                                        />
                                        <span className="text-ink-secondary">
                                            {stackLabels[stackId] ??
                                                'Unlabeled knowledge stack'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </article>
    );
}



function MeetingDetailsDialog({
    open,
    onOpenChange,
    meeting,
    disagreements,
    consensus,
    contextStats,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    meeting: MeetingWithParticipants;
    disagreements: Disagreement[];
    consensus: Consensus[];
    contextStats: ContextStats | undefined;
}) {
    const runtime = useMeetingsRuntime();
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogTitle>Meeting details</DialogTitle>
                <DialogDescription>
                    Context, counts, and participants for this room. Closing and playback stay
                    in the room itself.
                </DialogDescription>

                <section className="mt-4">
                    <h3 className="type-meta-strong text-ink-secondary">Meeting</h3>
                    <p className="mt-1 type-body text-ink">{meeting.name}</p>
                    <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 type-meta">
                        <div className="flex gap-2">
                            <dt className="text-ink-secondary">Status</dt>
                            <dd className="capitalize text-ink">{meeting.status}</dd>
                        </div>
                        <div className="flex gap-2">
                            <dt className="text-ink-secondary">Session</dt>
                            <dd className="text-ink">{runtime.presentation.label}</dd>
                        </div>
                    </dl>
                </section>

                {meeting.agenda && (
                    <section className="mt-4">
                        <h3 className="type-meta-strong text-ink-secondary">Agenda</h3>
                        <p className="mt-1 whitespace-pre-wrap type-body text-ink">
                            {meeting.agenda}
                        </p>
                    </section>
                )}

                <section className="mt-5">
                    <h3 className="type-meta-strong text-ink-secondary">Meeting record</h3>
                    <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 type-meta">
                        <div className="flex justify-between gap-3">
                            <dt className="text-ink-secondary">Participants</dt>
                            <dd className="type-tabular text-ink">
                                {meeting.participants?.length ?? 0}
                            </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-ink-secondary">Messages</dt>
                            <dd className="type-tabular text-ink">
                                {meeting.messages?.length ?? 0}
                            </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-ink-secondary">Disagreements</dt>
                            <dd className="type-tabular text-ink">{disagreements.length}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-ink-secondary">Consensus</dt>
                            <dd className="type-tabular text-ink">{consensus.length}</dd>
                        </div>
                        {meeting.total_cost > 0 && (
                            <div className="flex justify-between gap-3">
                                <dt className="text-ink-secondary">Cost</dt>
                                <dd className="type-tabular text-ink">
                                    {formatCost(meeting.total_cost)}
                                </dd>
                            </div>
                        )}
                    </dl>
                </section>

                {contextStats && (
                    <section className="mt-5">
                        <h3 className="type-meta-strong text-ink-secondary">Context usage</h3>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-raised">
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
                        <p className="mt-1 type-meta text-ink-muted">
                            {contextStats.current_tokens.toLocaleString()} /{' '}
                            {contextStats.max_tokens.toLocaleString()} tokens
                        </p>
                    </section>
                )}

                <section className="mt-5">
                    <h3 className="type-meta-strong text-ink-secondary">Participants</h3>
                    <div className="mt-2 space-y-2">
                        {(meeting.participants ?? []).map((participant) => (
                            <div
                                key={participant.id}
                                className="flex items-center gap-3 rounded-control border border-separator bg-surface-raised/50 p-2"
                            >
                                <ParticipantMark participant={participant} size="sm" />
                                <div className="min-w-0">
                                    <p className="type-control text-ink">{participant.name}</p>
                                    <p className="type-meta capitalize text-ink-muted">
                                        {participant.role}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </DialogContent>
        </Dialog>
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
            className="flex gap-3"
        >
            {isUser ? (
                <DirectorMark />
            ) : isSystem ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-selected">
                    <Bot className="h-4 w-4 text-ink-secondary" />
                </span>
            ) : participant ? (
                <ParticipantMark participant={participant} />
            ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised">
                    <Bot className="h-4 w-4 text-ink-secondary" />
                </span>
            )}
            <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="type-room-attribution text-ink">
                        {message.sender_name}
                    </span>
                    <span className="type-meta text-ink-muted">
                        {formatRelativeTime(message.created_at)}
                    </span>
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
                        isSystem &&
                            'rounded-control bg-surface-raised/60 px-4 py-3 type-room-body italic text-ink-secondary',
                        !isSystem && 'text-ink'
                    )}
                >
                    {isUser ? (
                        <p className="type-room-body whitespace-pre-wrap">{message.content}</p>
                    ) : isSystem ? (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                        <div className="room-markdown">
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
            <ParticipantMark
                participant={{
                    id: operation.participant_id ?? name,
                    name,
                    color,
                }}
            />
            <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="type-room-attribution text-ink">{name}</span>
                    {isQueued ? (
                        <Badge variant="secondary" className="bg-surface-raised type-meta text-ink-secondary">
                            <Clock className="mr-1 h-3 w-3" />
                            Queued
                            {operation.queue_position ? ` #${operation.queue_position}` : ''}
                        </Badge>
                    ) : (
                        <Loader2 className="h-3 w-3 animate-spin text-ink-muted" />
                    )}
                    {!isQueued && isObserving && (
                        <span className="type-meta text-ink-muted">
                            {runtime.replay ? 'recording' : 'live'}
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
                    <div className="text-ink">
                        <div className="room-markdown">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {projection.text}
                            </ReactMarkdown>
                            {!projection.terminal && !projection.observationInterrupted && (
                                <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-ink-muted motion-reduce:animate-none" />
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
                    <div className="mt-2 rounded-control border border-danger/60 bg-danger-soft px-3 py-2 type-control text-danger">
                        {projection.error.message}
                    </div>
                )}

                {projection?.observationInterrupted && (
                    <div className="mt-2 flex items-center gap-2 rounded-control border border-warning/60 bg-warning-soft px-3 py-2 type-meta text-warning">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1">
                            Observation paused. The turn continues on the server; this is not a
                            failure.
                        </span>
                        <button onClick={onResume} className="underline underline-offset-2">
                            Resume
                        </button>
                    </div>
                )}

                {!hasContent && !projection?.error && !projection?.observationInterrupted && (
                    <div className="rounded-control bg-surface-raised px-4 py-2.5 type-control text-ink-muted">
                        <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
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
