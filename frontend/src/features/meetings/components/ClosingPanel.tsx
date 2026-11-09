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
import { useAnchorRef } from '@/features/demo-tutorial';
import { useClosing, useClosingCapability } from '../api/closing-queries';
import {
    createClosingRequestKey,
    useAbortClosing,
    useRequestClosing,
    useRetryClosing,
} from '../api/closing-mutations';
import type {
    ClosingCredentialRequirement,
    ClosingMode,
    ClosingStage,
    ClosingSummarySettings,
    ClosingVote,
} from '../api/closing-decoders';
import type { MeetingStatus } from '../api/decoders';
import {
    findClosingBallotText,
    findClosingSummaryText,
    snapshotClosingText,
    type ClosingTextItem,
    type ClosingTextView,
} from '../model/closing-text';
import { useMeetingsRuntime } from '../runtime/context';
import { ClosingGeneratedText } from './ClosingGeneratedText';

export interface ClosingCredentialsApi {
    status(provider: string): { stored: boolean; unlocked: boolean };
    resolve(providers: string[]): Record<string, string>;
}

export interface ClosingPanelProps {
    meetingId: string;
    meetingStatus: MeetingStatus;
    summarySettings?: ClosingSummarySettings;
    /** Live-only vault capability. Replay omits it and skips preflight. */
    credentials?: ClosingCredentialsApi;
    /**
     * Spec 17 supplies recorded stream items here. When omitted, live polling
     * keeps projecting the canonical snapshot; an explicit projection never
     * falls back to snapshot prose.
     */
    textProjection?: ClosingTextView | null;
    /** Recorded playback may skip to the validated completed result. */
    onSkipText?: () => void;
    /** Restart the prepared closing observation from its source state. */
    onReplayClosing?: () => void;
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

type RequirementState =
    | 'done'
    | 'server'
    | 'browser'
    | 'locked'
    | 'missing'
    | 'none'
    | 'error';

function requirementState(
    requirement: ClosingCredentialRequirement,
    credentials: ClosingCredentialsApi
): RequirementState {
    if (!requirement.needed) return 'done';
    if (requirement.code !== 'ready' && requirement.code !== 'browser_key_required') {
        return 'error';
    }
    if (requirement.server_configured) return 'server';
    if (!requirement.needs_browser_key) return 'none';

    const status = credentials.status(requirement.provider);
    if (!status.stored) return 'missing';
    if (!status.unlocked) return 'locked';
    return 'browser';
}

function requirementReady(
    requirement: ClosingCredentialRequirement,
    credentials: ClosingCredentialsApi
): boolean {
    const state = requirementState(requirement, credentials);
    return state !== 'error' && state !== 'missing' && state !== 'locked';
}

function requirementLabel(requirement: ClosingCredentialRequirement): string {
    if (requirement.participant_name) return requirement.participant_name;
    return requirement.scope === 'summary' ? 'Final summary' : 'Participant';
}

function requirementStatusText(
    requirement: ClosingCredentialRequirement,
    credentials: ClosingCredentialsApi
): string {
    switch (requirementState(requirement, credentials)) {
        case 'server':
            return 'Server key ready';
        case 'browser':
            return 'Browser key ready';
        case 'locked':
            return 'Unlock the key vault in Settings';
        case 'missing':
            return `Add a ${requirement.provider} browser key in Settings`;
        case 'none':
            return 'No credential needed';
        case 'done':
            return 'Completed';
        case 'error':
            return requirement.message || 'Configuration error';
    }
}

function voteLabel(vote: ClosingVote): string {
    if (vote.vote === true) return 'Yes';
    if (vote.vote === false) return 'No';
    if (vote.status === 'pending') return 'Voting';
    return 'No vote';
}

function VoteRow({
    vote,
    textItem,
    replay = false,
}: {
    vote: ClosingVote;
    textItem: ClosingTextItem | undefined;
    replay?: boolean;
}) {
    const yes = vote.vote === true;
    const no = vote.vote === false;
    const pending = vote.status === 'pending';
    const cost = vote.reported_cost ?? vote.estimated_cost;
    const usageNote = replay
        ? null
        : typeof cost === 'number' && cost > 0
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
            className="flex items-start gap-2 rounded-lg bg-surface/50 p-2"
            data-vote-status={
                pending ? 'pending' : yes ? 'yes' : no ? 'no' : 'no-vote'
            }
        >
            {yes ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : no ? (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            ) : pending ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 motion-safe:animate-spin text-warning" />
            ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            )}
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">
                        {vote.participant_name}
                    </span>
                    <Badge
                        variant="secondary"
                        className={
                            yes
                                ? 'bg-success-soft text-xs text-success'
                                : no
                                  ? 'bg-danger-soft text-xs text-danger'
                                  : 'bg-warning-soft text-xs text-warning'
                        }
                    >
                        {voteLabel(vote)}
                    </Badge>
                    {typeof cost === 'number' && cost > 0 ? (
                        <span className="text-xs text-ink-muted">${cost.toFixed(4)}</span>
                    ) : null}
                    {usageNote ? (
                        <span className="text-xs text-ink-muted">{usageNote}</span>
                    ) : null}
                </div>
                <ClosingGeneratedText
                    item={textItem}
                    className="mt-0.5 text-xs text-ink-muted"
                />
                {vote.error_message ? (
                    <p className="mt-0.5 text-xs text-warning">{vote.error_message}</p>
                ) : null}
                {vote.error_code ? (
                    <p className="mt-0.5 text-xs text-ink-muted">
                        Error code: {vote.error_code}
                    </p>
                ) : null}
            </div>
        </div>
    );
}

function StatusCard({
    id,
    tone,
    icon,
    title,
    children,
}: {
    id?: string;
    tone: 'active' | 'success' | 'warning' | 'error' | 'muted';
    icon: React.ReactNode;
    title: string;
    children?: React.ReactNode;
}) {
    const toneClasses = {
        active: 'border-action/50 bg-accent-soft',
        success: 'border-success/50 bg-success-soft',
        warning: 'border-warning/50 bg-warning-soft',
        error: 'border-danger/50 bg-danger-soft',
        muted: 'border-separator bg-surface/50',
    }[tone];
    return (
        <Card
            id={id}
            className={`p-4 ${toneClasses}`}
            role="status"
            aria-live="polite"
        >
            <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0">{icon}</span>
                <div className="min-w-0 flex-1">
                    <h4 className="mb-1 font-medium text-ink">{title}</h4>
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
    credentials,
    textProjection,
    onSkipText,
    onReplayClosing,
}: ClosingPanelProps) {
    const runtime = useMeetingsRuntime();
    const voteRef = useAnchorRef('room.vote');
    const voteConfirmRef = useAnchorRef('room.vote-confirm');
    const [confirmMode, setConfirmMode] = useState<ClosingMode | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [archiving, setArchiving] = useState(false);
    const pendingIntent = useRef<PendingIntent | null>(null);

    const closingQuery = useClosing(meetingId, true, runtime);
    const capabilityQuery = useClosingCapability(
        meetingId,
        Boolean(credentials),
        runtime
    );
    const request = useRequestClosing(runtime, {
        resolveProviderKeys: credentials
            ? (providers) => credentials.resolve(providers)
            : undefined,
    });
    const retry = useRetryClosing(runtime, {
        resolveProviderKeys: credentials
            ? (providers) => credentials.resolve(providers)
            : undefined,
    });
    const abort = useAbortClosing(runtime);

    const closing = closingQuery.data;
    const projection =
        textProjection === undefined
            ? closing
                ? snapshotClosingText(closing)
                : null
            : textProjection &&
                closing &&
                textProjection.closingId === closing.closing_id
              ? textProjection
              : null;
    const summaryText = projection ? findClosingSummaryText(projection) : undefined;
    const textTerminal = Boolean(
        projection?.items.some((item) => item.kind === 'summary' && item.terminal)
    );
    const stage = closing?.stage ?? null;
    const status = closing?.meeting_status ?? meetingStatus;
    const archived = status === 'archived' || Boolean(closing?.archived);
    const ended = status === 'ended' || stage === 'completed';
    const votes = closing?.votes ?? [];
    const busy = request.isPending || retry.isPending || abort.isPending;
    const deckClosing =
        runtime.replay && (runtime.replay.preparedTurns ?? []).length > 0
            ? runtime.replay
            : null;
    const replayClosingAction =
        runtime.replay
            ?.legalActions()
            .find(
                (action) =>
                    action.intent.kind === 'request_closing' &&
                    action.available
            ) ?? null;
    const replayClosingIntent = replayClosingAction?.intent ?? null;
    const canStart =
        !archived &&
        !ended &&
        (status === 'active' || status === 'voting') &&
        !isAdvancing(stage) &&
        stage !== 'failed' &&
        (deckClosing
            ? deckClosing.canClose
            : runtime.replay
              ? Boolean(replayClosingIntent)
              : true);
    const replayClosingUnavailable =
        Boolean(runtime.replay) &&
        !canStart &&
        !archived &&
        !ended &&
        !isAdvancing(stage) &&
        stage !== 'failed' &&
        stage !== 'rejected' &&
        stage !== 'aborted';

    const capability = capabilityQuery.data;
    const preflightLoading = Boolean(credentials) && capabilityQuery.isLoading;
    const voteReady = !credentials || Boolean(capability?.ready_for_vote);
    const forceReady = !credentials || Boolean(capability?.ready_for_force);
    const retryReady =
        !credentials ||
        (closing?.mode === 'force' ? forceReady : voteReady);
    const neededRequirements = (capability?.requirements ?? []).filter(
        (requirement) => requirement.needed
    );

    const requirementsForMode = (mode: ClosingMode): ClosingCredentialRequirement[] => {
        const requirements = capability?.requirements ?? [];
        const scoped =
            mode === 'force'
                ? requirements.filter((requirement) => requirement.scope === 'summary')
                : requirements;
        return scoped.filter((requirement) => requirement.needed);
    };

    const providersForMode = (mode: ClosingMode): string[] => {
        if (!credentials) return [];
        return Array.from(
            new Set(
                requirementsForMode(mode)
                    .filter(
                        (requirement) =>
                            (requirement.code === 'ready' ||
                                requirement.code === 'browser_key_required') &&
                            requirement.needs_browser_key &&
                            !requirement.server_configured &&
                            requirement.provider
                    )
                    .map((requirement) => requirement.provider)
            )
        );
    };

    const missingCredentialMessage = (mode: ClosingMode): string | null => {
        if (!credentials) return null;
        const missing = requirementsForMode(mode).filter(
            (requirement) => !requirementReady(requirement, credentials)
        );
        if (missing.length === 0) return null;
        return `The close cannot start yet: ${missing
            .map(
                (requirement) =>
                    `${requirementLabel(requirement)} — ${requirementStatusText(
                        requirement,
                        credentials
                    )}`
            )
            .join('; ')}.`;
    };

    const startClose = async (mode: ClosingMode) => {
        setConfirmMode(null);
        setActionError(null);

        if (runtime.replay) {
            try {
                if (deckClosing) {
                    await deckClosing.startPreparedClosing();
                } else if (replayClosingIntent) {
                    await runtime.replay.startIntent(
                        replayClosingIntent.intent_id
                    );
                } else {
                    setActionError(
                        'This demo has no supported closing step.'
                    );
                }
            } catch (error) {
                setActionError(errorMessage(error));
            }
            return;
        }

        const previous = pendingIntent.current;
        const intent =
            previous?.mode === mode
                ? previous
                : { key: createClosingRequestKey(), mode };

        let providersToResolve: string[] = [];
        if (credentials) {
            const missing = missingCredentialMessage(mode);
            if (missing) {
                setActionError(missing);
                void capabilityQuery.refetch();
                return;
            }
            providersToResolve = providersForMode(mode);
            const resolved = credentials.resolve(providersToResolve);
            if (providersToResolve.some((provider) => !resolved[provider])) {
                setActionError(
                    'The key vault locked before the close started. Unlock it and try again.'
                );
                return;
            }
        }

        try {
            pendingIntent.current = intent;
            await request.mutateAsync({
                meetingId,
                mode,
                requestKey: intent.key,
                summarySettings,
                providersToResolve,
            });
            pendingIntent.current = null;
        } catch (error) {
            // A definitive rejection may be corrected with a fresh key; an
            // ambiguous network/5xx failure must replay the same intent.
            if (!isAmbiguousFailure(error)) {
                pendingIntent.current = null;
            }
            if (isApiError(error) && error.status === 409) {
                void capabilityQuery.refetch();
            }
            setActionError(errorMessage(error));
        }
    };

    const retryClose = async () => {
        setActionError(null);
        if (credentials) {
            const mode = closing?.mode ?? 'vote';
            const missing = missingCredentialMessage(mode);
            if (missing) {
                setActionError(missing);
                void capabilityQuery.refetch();
                return;
            }
        }
        try {
            await retry.mutateAsync(
                credentials
                    ? {
                          meetingId,
                          providersToResolve: providersForMode(
                              closing?.mode ?? 'vote'
                          ),
                      }
                    : meetingId
            );
        } catch (error) {
            if (isApiError(error) && error.status === 409) {
                void capabilityQuery.refetch();
            }
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
            <h4 className="flex items-center gap-2 text-sm font-semibold text-ink-secondary">
                <LogOut className="h-4 w-4" />
                Close Meeting
            </h4>

            {credentials ? (
                <Card
                    id="closing-credential-preflight"
                    className="border-separator bg-surface/50 p-4"
                >
                    <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        Credential preflight
                    </h5>
                    {preflightLoading ? (
                        <p className="flex items-center gap-2 text-sm text-ink-secondary">
                            <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                            Checking the credentials this close needs…
                        </p>
                    ) : capabilityQuery.error ? (
                        <div className="flex items-center gap-2 text-sm text-warning">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span className="flex-1">
                                Credential requirements could not be read:{' '}
                                {capabilityQuery.error.message}
                            </span>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void capabilityQuery.refetch()}
                                className="text-warning hover:text-ink"
                            >
                                Reconnect
                            </Button>
                        </div>
                    ) : neededRequirements.length === 0 ? (
                        <p className="text-sm text-ink-secondary">
                            No remaining credentials are required.
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {neededRequirements.map((requirement) => {
                                const state = requirementState(requirement, credentials);
                                const ready =
                                    state !== 'error' &&
                                    state !== 'missing' &&
                                    state !== 'locked';
                                return (
                                    <li
                                        key={`${requirement.scope}-${requirement.participant_id ?? 'summary'}-${requirement.provider}`}
                                        className="flex items-start gap-2"
                                    >
                                        {ready ? (
                                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                                        ) : (
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-medium text-ink">
                                                    {requirementLabel(requirement)}
                                                </span>
                                                <span className="text-xs text-ink-muted">
                                                    {requirement.provider || 'unknown provider'}
                                                    {requirement.model
                                                        ? ` · ${requirement.model}`
                                                        : ''}
                                                </span>
                                            </div>
                                            <p
                                                className={`text-xs ${
                                                    ready ? 'text-success' : 'text-warning'
                                                }`}
                                            >
                                                {requirementStatusText(
                                                    requirement,
                                                    credentials
                                                )}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {!preflightLoading &&
                    !capabilityQuery.error &&
                    (!voteReady || !forceReady) ? (
                        <p className="mt-2 text-xs text-ink-muted">
                            Unlock the key vault or add the missing provider key in
                            Settings, then return to start the close.
                        </p>
                    ) : null}
                </Card>
            ) : null}

            {archived ? (
                <StatusCard
                    id="closing-status"
                    tone="muted"
                    icon={<Archive className="h-5 w-5 text-ink-secondary" />}
                    title="Meeting archived"
                >
                    <p className="text-sm text-ink-secondary">
                        Archived meetings are read-only. Unarchiving never reopens an
                        ended meeting.
                    </p>
                </StatusCard>
            ) : null}

            {!archived && ended ? (
                <StatusCard
                    id="closing-status"
                    tone="success"
                    icon={<CheckCircle2 className="h-5 w-5 text-success" />}
                    title="Meeting ended"
                >
                    <p className="text-sm text-ink-secondary">
                        {runtime.replay
                            ? 'The demo final summary is shown below.'
                            : 'The final summary is committed below and in Summary History. The chat is now read-only.'}
                    </p>
                </StatusCard>
            ) : null}

            {!archived && ended && deckClosing ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={archiving}
                    onClick={async () => {
                        setActionError(null);
                        setArchiving(true);
                        try {
                            await deckClosing.archivePreparedMeeting();
                        } catch (error) {
                            setActionError(errorMessage(error));
                        } finally {
                            setArchiving(false);
                        }
                    }}
                >
                    <Archive className="mr-2 h-4 w-4" />
                    {archiving ? 'Archiving…' : 'Archive meeting'}
                </Button>
            ) : null}

            {!archived && !ended && isAdvancing(stage) ? (
                <StatusCard
                    id="closing-status"
                    tone="active"
                    icon={<Loader2 className="h-5 w-5 animate-spin text-action" />}
                    title={
                        stage === 'draining'
                            ? 'Finishing queued work'
                            : stage === 'voting'
                              ? 'Voting in progress'
                              : 'Writing summary'
                    }
                >
                    <p className="text-sm text-ink-secondary">{stage ? STAGE_COPY[stage] : ''}</p>
                    <p className="mt-1 text-xs text-ink-muted">
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
                                className="border-control text-ink-secondary"
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
                    id="closing-status"
                    tone="error"
                    icon={<AlertTriangle className="h-5 w-5 text-danger" />}
                    title="Closing failed"
                >
                    <p className="text-sm text-ink-secondary">
                        {closing?.error?.message || STAGE_COPY.failed}
                    </p>
                    {closing?.error?.code ? (
                        <p className="mt-1 text-xs text-ink-muted">
                            Error code: {closing.error.code}
                        </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                        {closing?.retryable ? (
                            <Button
                                id="closing-retry"
                                size="sm"
                                onClick={retryClose}
                                disabled={busy || !retryReady}
                                className="bg-action hover:bg-action-hover"
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
                                className="border-control text-ink-secondary"
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
                    id="closing-status"
                    tone="warning"
                    icon={<XCircle className="h-5 w-5 text-warning" />}
                    title="Closing rejected"
                >
                    <p className="text-sm text-ink-secondary">{STAGE_COPY.rejected}</p>
                    {canStart ? (
                        <p className="mt-1 text-xs text-ink-muted">
                            You can start another close request below.
                        </p>
                    ) : null}
                </StatusCard>
            ) : null}

            {!archived && !ended && stage === 'aborted' ? (
                <StatusCard
                    id="closing-status"
                    tone="warning"
                    icon={<Ban className="h-5 w-5 text-warning" />}
                    title="Closing abandoned"
                >
                    <p className="text-sm text-ink-secondary">{STAGE_COPY.aborted}</p>
                    {canStart ? (
                        <p className="mt-1 text-xs text-ink-muted">
                            Turn submission is available again. You can start another
                            close request below.
                        </p>
                    ) : null}
                </StatusCard>
            ) : null}

            {votes.length > 0 ? (
                <div id="closing-ballots" className="space-y-2">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        Ballots
                    </h5>
                    <p className="text-xs text-ink-muted">
                        Each ballot answers only whether this meeting should end, not
                        whether any proposal is approved.
                    </p>
                    {votes.map((vote) => (
                        <VoteRow
                            key={vote.participant_id}
                            vote={vote}
                            replay={Boolean(runtime.replay)}
                            textItem={
                                projection
                                    ? findClosingBallotText(
                                          projection,
                                          vote.participant_id
                                      )
                                    : undefined
                            }
                        />
                    ))}
                </div>
            ) : null}

            {(onSkipText && textProjection && !textTerminal) || (ended && onReplayClosing) ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-separator bg-surface/40 px-3 py-2">
                    <span className="text-xs text-ink-secondary">Closing summary</span>
                    {onSkipText && textProjection && !textTerminal ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={onSkipText}
                        >
                            Show full response
                        </Button>
                    ) : null}
                    {ended && onReplayClosing ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={onReplayClosing}
                        >
                            Review closing
                        </Button>
                    ) : null}
                </div>
            ) : null}

            {summaryText || (deckClosing && closing?.summary) ? (
                <Card id="closing-final-summary" className="border-separator bg-surface/50 p-4">
                    <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        Summary
                    </h5>
                    {summaryText ? (
                        <ClosingGeneratedText
                            item={summaryText}
                            className="whitespace-pre-wrap text-sm text-ink-secondary"
                        />
                    ) : (
                        <p className="whitespace-pre-wrap text-sm text-ink-secondary">
                            {closing?.summary}
                        </p>
                    )}
                </Card>
            ) : null}

            {actionError ? (
                <div className="flex items-center gap-2 rounded-lg border border-danger/60 bg-danger-soft p-3 text-danger">
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
                <div className="flex items-center gap-2 rounded-lg border border-warning/60 bg-warning-soft p-3 text-warning">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-sm">
                        Closing progress could not be read: {closingQuery.error.message}
                    </span>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void closingQuery.refetch()}
                        className="text-warning hover:text-ink"
                    >
                        Reconnect
                    </Button>
                </div>
            ) : null}

            {replayClosingUnavailable ? (
                <StatusCard
                    tone="muted"
                    icon={<LogOut className="h-5 w-5 text-ink-muted" />}
                    title="Closing is not available yet"
                >
                    <p className="text-sm text-ink-secondary">
                        {deckClosing?.closeReason ??
                            'Continue through every reply and send the follow-up before closing.'}
                    </p>
                </StatusCard>
            ) : null}

            {canStart ? (
                confirmMode === null ? (
                    <Card className="border-separator bg-surface/50 p-4">
                        <div className="mb-3">
                            <h4 className="mb-1 font-medium text-ink">End this meeting?</h4>
                            <p className="text-xs text-ink-muted">
                                Closing waits for queued work, then optionally votes
                                before writing the final summary.
                            </p>
                        </div>
                        <div className={runtime.replay ? 'grid gap-3' : 'grid grid-cols-2 gap-3'}>
                            <Button
                                ref={voteRef}
                                id="closing-start-vote"
                                variant="outline"
                                onClick={() => setConfirmMode('vote')}
                                disabled={busy || !voteReady || preflightLoading}
                                className="h-auto flex-col items-center border-control py-3 hover:bg-surface-raised"
                            >
                                <Vote className="mb-1 h-5 w-5 text-warning" />
                                <span className="font-medium">Vote to End</span>
                                <span className="text-xs text-ink-muted">
                                    Ask participants
                                </span>
                            </Button>
                            {!runtime.replay ? (
                                <Button
                                    id="closing-start-force"
                                    variant="outline"
                                    onClick={() => setConfirmMode('force')}
                                    disabled={busy || !forceReady || preflightLoading}
                                    className="h-auto flex-col items-center border-danger/60 py-3 text-danger hover:bg-danger-soft"
                                >
                                    <LogOut className="mb-1 h-5 w-5" />
                                    <span className="font-medium">Force End</span>
                                    <span className="text-xs text-ink-muted">
                                        Skip the vote
                                    </span>
                                </Button>
                            ) : null}
                        </div>
                    </Card>
                ) : (
                    <Card className="border-danger/50 bg-danger-soft p-4">
                        <div className="mb-4 flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                            <div>
                                <h4 className="mb-1 font-medium text-ink">
                                    {confirmMode === 'force'
                                        ? 'Force this meeting to end?'
                                        : 'Ask the board to end this meeting?'}
                                </h4>
                                <p className="text-sm text-ink-secondary">
                                    {confirmMode === 'force'
                                        ? 'The vote is skipped. Queued work is still allowed to drain before the summary.'
                                        : 'Participants vote first. A rejected vote leaves the meeting active.'}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                ref={voteConfirmRef}
                                id="closing-confirm"
                                onClick={() => startClose(confirmMode)}
                                disabled={
                                    busy ||
                                    preflightLoading ||
                                    !(confirmMode === 'force' ? forceReady : voteReady)
                                }
                                className={
                                    confirmMode === 'force'
                                        ? 'bg-danger text-on-danger hover:bg-danger-hover'
                                        : 'bg-action text-action-foreground hover:bg-action-hover'
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
                                className="text-ink-secondary hover:text-ink"
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
