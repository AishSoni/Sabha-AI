'use client';

/**
 * Coordinated closing panel (spec-08).
 *
 * Every stage the durable operation can be in is rendered explicitly:
 * draining, voting, summarizing, completed, rejected, aborted, and failed.
 * A failure is never hidden behind a spinner — it offers an explicit retry
 * or abort. Reload is safe because all progress comes from the canonical
 * closing read; the panel never reconstructs or regenerates a summary.
 */
import { useRef, useState } from 'react';
import {
    AlertTriangle,
    Archive,
    Ban,
    CheckCircle2,
    Loader2,
    LogOut,
    RotateCcw,
    Vote,
    XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isApiError } from '@/shared/api/errors';
import {
    createClosingRequestKey,
    useAbortClosing,
    useClosing,
    useRequestClosing,
    useRetryClosing,
    type ClosingMode,
    type ClosingStage,
    type ClosingSummarySettings,
    type ClosingVote,
} from '../api';
import type { MeetingStatus } from '../api/decoders';
import { useMeetingsRuntime } from '../runtime/context';

export interface ClosingPanelProps {
    meetingId: string;
    meetingStatus: MeetingStatus;
    summarySettings?: ClosingSummarySettings;
}

interface PendingIntent {
    key: string;
    mode: ClosingMode;
}

const STAGE_COPY: Record<ClosingStage, string> = {
    draining: 'Waiting for queued and running work to finish…',
    voting: 'Participants are voting on whether to end the meeting…',
    summarizing: 'Writing the final summary…',
    completed: 'The meeting has ended.',
    rejected: 'The board did not approve closing. The meeting stays active.',
    aborted: 'Closing was abandoned. The meeting is active again.',
    failed: 'Closing could not finish.',
};

function isAmbiguousFailure(error: unknown): boolean {
    if (!isApiError(error)) return true;
    if (error.kind === 'network') return true;
    if (error.kind === 'aborted') return false;
    return error.status !== null && error.status >= 500;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'The close request failed.';
}

function isAdvancing(stage: ClosingStage | null | undefined): boolean {
    return stage === 'draining' || stage === 'voting' || stage === 'summarizing';
}

function voteLabel(vote: ClosingVote): string {
    if (vote.vote === true) return 'Yes';
    if (vote.vote === false) return 'No';
    if (vote.status === 'pending') return 'Voting';
    return 'No vote';
}

function VoteRow({ vote }: { vote: ClosingVote }) {
    const yes = vote.vote === true;
    const no = vote.vote === false;
    const pending = vote.status === 'pending';
    const cost = vote.reported_cost ?? vote.estimated_cost;
    const usageNote =
        typeof cost === 'number' && cost > 0
            ? null
            : vote.usage_kind === 'unknown'
              ? 'Usage not reported'
              : vote.price_kind === 'unpriced'
                ? 'Usage unpriced'
                : vote.price_kind === 'zero_local'
                  ? 'No provider cost'
                  : null;
    return (
        <div
            className="flex items-start gap-2 rounded-lg bg-zinc-900/50 p-2"
            data-vote-status={
                pending ? 'pending' : yes ? 'yes' : no ? 'no' : 'no-vote'
            }
        >
            {yes ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
            ) : no ? (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            ) : pending ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 motion-safe:animate-spin text-amber-400" />
            ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            )}
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white">
                        {vote.participant_name}
                    </span>
                    <Badge
                        variant="secondary"
                        className={
                            yes
                                ? 'bg-green-900/50 text-xs text-green-400'
                                : no
                                  ? 'bg-red-900/50 text-xs text-red-400'
                                  : 'bg-amber-900/50 text-xs text-amber-400'
                        }
                    >
                        {voteLabel(vote)}
                    </Badge>
                    {typeof cost === 'number' && cost > 0 ? (
                        <span className="text-xs text-zinc-500">${cost.toFixed(4)}</span>
                    ) : null}
                    {usageNote ? (
                        <span className="text-xs text-zinc-500">{usageNote}</span>
                    ) : null}
                </div>
                {vote.reason ? (
                    <p className="mt-0.5 text-xs text-zinc-500">{vote.reason}</p>
                ) : null}
                {vote.error_message ? (
                    <p className="mt-0.5 text-xs text-amber-400">{vote.error_message}</p>
                ) : null}
                {vote.error_code ? (
                    <p className="mt-0.5 text-xs text-zinc-500">
                        Error code: {vote.error_code}
                    </p>
                ) : null}
            </div>
        </div>
    );
}

function StatusCard({
    tone,
    icon,
    title,
    children,
}: {
    tone: 'active' | 'success' | 'warning' | 'error' | 'muted';
    icon: React.ReactNode;
    title: string;
    children?: React.ReactNode;
}) {
    const toneClasses = {
        active: 'border-indigo-800/50 bg-indigo-950/30',
        success: 'border-green-800/50 bg-green-950/30',
        warning: 'border-amber-800/50 bg-amber-950/30',
        error: 'border-red-800/50 bg-red-950/30',
        muted: 'border-zinc-800 bg-zinc-900/50',
    }[tone];
    return (
        <Card className={`p-4 ${toneClasses}`} role="status" aria-live="polite">
            <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0">{icon}</span>
                <div className="min-w-0 flex-1">
                    <h4 className="mb-1 font-medium text-white">{title}</h4>
                    {children}
                </div>
            </div>
        </Card>
    );
}

export function ClosingPanel({
    meetingId,
    meetingStatus,
    summarySettings,
}: ClosingPanelProps) {
    const runtime = useMeetingsRuntime();
    const [confirmMode, setConfirmMode] = useState<ClosingMode | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const pendingIntent = useRef<PendingIntent | null>(null);

    const closingQuery = useClosing(meetingId, true, runtime);
    const request = useRequestClosing(runtime);
    const retry = useRetryClosing(runtime);
    const abort = useAbortClosing(runtime);

    const closing = closingQuery.data;
    const stage = closing?.stage ?? null;
    const status = closing?.meeting_status ?? meetingStatus;
    const archived = status === 'archived' || Boolean(closing?.archived);
    const ended = status === 'ended' || stage === 'completed';
    const votes = closing?.votes ?? [];
    const busy = request.isPending || retry.isPending || abort.isPending;
    const canStart =
        !archived &&
        !ended &&
        (status === 'active' || status === 'voting') &&
        !isAdvancing(stage) &&
        stage !== 'failed';

    const startClose = async (mode: ClosingMode) => {
        setConfirmMode(null);
        setActionError(null);

        const previous = pendingIntent.current;
        const intent =
            previous?.mode === mode
                ? previous
                : { key: createClosingRequestKey(), mode };
        pendingIntent.current = intent;

        try {
            await request.mutateAsync({
                meetingId,
                mode,
                requestKey: intent.key,
                summarySettings,
            });
            pendingIntent.current = null;
        } catch (error) {
            // A definitive rejection may be corrected with a fresh key; an
            // ambiguous network/5xx failure must replay the same intent.
            if (!isAmbiguousFailure(error)) {
                pendingIntent.current = null;
            }
            setActionError(errorMessage(error));
        }
    };

    const retryClose = async () => {
        setActionError(null);
        try {
            await retry.mutateAsync(meetingId);
        } catch (error) {
            setActionError(errorMessage(error));
        }
    };

    const abortClose = async () => {
        setActionError(null);
        try {
            await abort.mutateAsync(meetingId);
        } catch (error) {
            setActionError(errorMessage(error));
        }
    };

    return (
        <div id="closing-panel" className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-400">
                <LogOut className="h-4 w-4" />
                Close Meeting
            </h4>

            {archived ? (
                <StatusCard
                    tone="muted"
                    icon={<Archive className="h-5 w-5 text-zinc-400" />}
                    title="Meeting archived"
                >
                    <p className="text-sm text-zinc-400">
                        Archived meetings are read-only. Unarchiving never reopens an
                        ended meeting.
                    </p>
                </StatusCard>
            ) : null}

            {!archived && ended ? (
                <StatusCard
                    tone="success"
                    icon={<CheckCircle2 className="h-5 w-5 text-green-400" />}
                    title="Meeting ended"
                >
                    <p className="text-sm text-zinc-400">
                        The final summary is committed below and in Summary History.
                        The chat is now read-only.
                    </p>
                </StatusCard>
            ) : null}

            {!archived && !ended && isAdvancing(stage) ? (
                <StatusCard
                    tone="active"
                    icon={<Loader2 className="h-5 w-5 animate-spin text-indigo-400" />}
                    title={
                        stage === 'draining'
                            ? 'Finishing queued work'
                            : stage === 'voting'
                              ? 'Voting in progress'
                              : 'Writing summary'
                    }
                >
                    <p className="text-sm text-zinc-400">{stage ? STAGE_COPY[stage] : ''}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                        This is safe to leave. Reloading resumes observation, not
                        generation.
                    </p>
                    {closing?.abortable ? (
                        <div className="mt-3">
                            <Button
                                id="closing-abort"
                                size="sm"
                                variant="outline"
                                onClick={abortClose}
                                disabled={busy}
                                className="border-zinc-700 text-zinc-300"
                            >
                                {abort.isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />
                                ) : (
                                    <Ban className="mr-2 h-4 w-4" />
                                )}
                                Abort closing
                            </Button>
                        </div>
                    ) : null}
                </StatusCard>
            ) : null}

            {!archived && !ended && stage === 'failed' ? (
                <StatusCard
                    tone="error"
                    icon={<AlertTriangle className="h-5 w-5 text-red-400" />}
                    title="Closing failed"
                >
                    <p className="text-sm text-zinc-300">
                        {closing?.error?.message || STAGE_COPY.failed}
                    </p>
                    {closing?.error?.code ? (
                        <p className="mt-1 text-xs text-zinc-500">
                            Error code: {closing.error.code}
                        </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                        {closing?.retryable ? (
                            <Button
                                id="closing-retry"
                                size="sm"
                                onClick={retryClose}
                                disabled={busy}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                {retry.isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />
                                ) : (
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                )}
                                Retry closing
                            </Button>
                        ) : null}
                        {closing?.abortable ? (
                            <Button
                                id="closing-abort"
                                size="sm"
                                variant="outline"
                                onClick={abortClose}
                                disabled={busy}
                                className="border-zinc-700 text-zinc-300"
                            >
                                {abort.isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />
                                ) : (
                                    <Ban className="mr-2 h-4 w-4" />
                                )}
                                Abort closing
                            </Button>
                        ) : null}
                    </div>
                </StatusCard>
            ) : null}

            {!archived && !ended && stage === 'rejected' ? (
                <StatusCard
                    tone="warning"
                    icon={<XCircle className="h-5 w-5 text-amber-400" />}
                    title="Closing rejected"
                >
                    <p className="text-sm text-zinc-300">{STAGE_COPY.rejected}</p>
                    {canStart ? (
                        <p className="mt-1 text-xs text-zinc-500">
                            You can start another close request below.
                        </p>
                    ) : null}
                </StatusCard>
            ) : null}

            {!archived && !ended && stage === 'aborted' ? (
                <StatusCard
                    tone="warning"
                    icon={<Ban className="h-5 w-5 text-amber-400" />}
                    title="Closing abandoned"
                >
                    <p className="text-sm text-zinc-300">{STAGE_COPY.aborted}</p>
                    {canStart ? (
                        <p className="mt-1 text-xs text-zinc-500">
                            Turn submission is available again. You can start another
                            close request below.
                        </p>
                    ) : null}
                </StatusCard>
            ) : null}

            {votes.length > 0 ? (
                <div id="closing-ballots" className="space-y-2">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Ballots
                    </h5>
                    <p className="text-xs text-zinc-500">
                        Each ballot answers only whether this meeting should end, not
                        whether any proposal is approved.
                    </p>
                    {votes.map((vote) => (
                        <VoteRow key={vote.participant_id} vote={vote} />
                    ))}
                </div>
            ) : null}

            {closing?.summary ? (
                <Card id="closing-final-summary" className="border-zinc-800 bg-zinc-900/50 p-4">
                    <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Final summary
                    </h5>
                    <p className="whitespace-pre-wrap text-sm text-zinc-300">
                        {closing.summary}
                    </p>
                </Card>
            ) : null}

            {actionError ? (
                <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/30 p-3 text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-sm">{actionError}</span>
                    <button
                        type="button"
                        onClick={() => setActionError(null)}
                        className="text-xs hover:underline"
                    >
                        Dismiss
                    </button>
                </div>
            ) : null}

            {closingQuery.error ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-800 bg-amber-900/30 p-3 text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-sm">
                        Closing progress could not be read: {closingQuery.error.message}
                    </span>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void closingQuery.refetch()}
                        className="text-amber-300 hover:text-white"
                    >
                        Reconnect
                    </Button>
                </div>
            ) : null}

            {canStart ? (
                confirmMode === null ? (
                    <Card className="border-zinc-800 bg-zinc-900/50 p-4">
                        <div className="mb-3">
                            <h4 className="mb-1 font-medium text-white">End this meeting?</h4>
                            <p className="text-xs text-zinc-500">
                                Closing waits for queued work, then optionally votes
                                before writing the final summary.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                id="closing-start-vote"
                                variant="outline"
                                onClick={() => setConfirmMode('vote')}
                                disabled={busy}
                                className="h-auto flex-col items-center border-zinc-700 py-3 hover:bg-zinc-800"
                            >
                                <Vote className="mb-1 h-5 w-5 text-amber-400" />
                                <span className="font-medium">Vote to End</span>
                                <span className="text-xs text-zinc-500">
                                    Ask participants
                                </span>
                            </Button>
                            <Button
                                id="closing-start-force"
                                variant="outline"
                                onClick={() => setConfirmMode('force')}
                                disabled={busy}
                                className="h-auto flex-col items-center border-red-800 py-3 text-red-400 hover:bg-red-900/20"
                            >
                                <LogOut className="mb-1 h-5 w-5" />
                                <span className="font-medium">Force End</span>
                                <span className="text-xs text-zinc-500">
                                    Skip the vote
                                </span>
                            </Button>
                        </div>
                    </Card>
                ) : (
                    <Card className="border-red-800/50 bg-red-950/30 p-4">
                        <div className="mb-4 flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                            <div>
                                <h4 className="mb-1 font-medium text-white">
                                    {confirmMode === 'force'
                                        ? 'Force this meeting to end?'
                                        : 'Ask the board to end this meeting?'}
                                </h4>
                                <p className="text-sm text-zinc-400">
                                    {confirmMode === 'force'
                                        ? 'The vote is skipped. Queued work is still allowed to drain before the summary.'
                                        : 'Participants vote first. A rejected vote leaves the meeting active.'}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                id="closing-confirm"
                                onClick={() => startClose(confirmMode)}
                                disabled={busy}
                                className={
                                    confirmMode === 'force'
                                        ? 'bg-red-700 hover:bg-red-600'
                                        : 'bg-indigo-600 hover:bg-indigo-700'
                                }
                            >
                                {busy ? (
                                    <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />
                                ) : null}
                                {confirmMode === 'force' ? 'Force End' : 'Start Vote'}
                            </Button>
                            <Button
                                id="closing-cancel"
                                variant="ghost"
                                onClick={() => setConfirmMode(null)}
                                disabled={busy}
                                className="text-zinc-400 hover:text-white"
                            >
                                Cancel
                            </Button>
                        </div>
                    </Card>
                )
            ) : null}
        </div>
    );
}
