'use client';

import { useState } from 'react';
import { Camera, CheckCircle2, History, Lock, ShieldCheck } from 'lucide-react';
import { ParticipantMark } from '@/components/identity/participant-mark';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
    LocalParticipantSnapshot,
    WorkspacePersona,
} from '@/features/demo-workspace';
import type { PersonaStackOption } from '../model/types';
import { composeSystemPrompt } from '../presentation/prompt';

export interface RecordedParticipantView {
    participant_id: string;
    name: string;
    role: string;
    persona_summary: string;
    stack_ids: string[];
    color: string;
}

export interface BoardStackView {
    label: string;
    scope: 'shared' | 'private';
}

export interface DemoSnapshotPanelProps {
    personaId: string;
    personas: WorkspacePersona[];
    stacks: PersonaStackOption[];
    baseInstructions: string | null;
    snapshots: LocalParticipantSnapshot[];
    recordedParticipant?: RecordedParticipantView | null;
    boardStacks?: Record<string, BoardStackView>;
    onCapture: (personaId: string) => Promise<LocalParticipantSnapshot>;
}

function stackList(
    ids: string[],
    labels: Map<string, PersonaStackOption>
): string[] {
    return ids.map((id) => labels.get(id)?.name ?? id);
}

export function DemoSnapshotPanel({
    personaId,
    personas,
    stacks,
    baseInstructions,
    snapshots,
    recordedParticipant,
    boardStacks = {},
    onCapture,
}: DemoSnapshotPanelProps) {
    const [capturing, setCapturing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [announcement, setAnnouncement] = useState('');

    const persona = personas.find((item) => item.personaId === personaId);
    const activeRevision = persona?.revisions.find(
        (revision) => revision.revisionId === persona.activeRevisionId
    );
    const activeVersion = persona
        ? persona.revisions.findIndex(
              (revision) => revision.revisionId === persona.activeRevisionId
          ) + 1
        : null;
    const labels = new Map(stacks.map((stack) => [stack.id, stack]));
    const composed = activeRevision
        ? composeSystemPrompt(baseInstructions, activeRevision.prompt)
        : '';
    const canCapture = Boolean(activeRevision && baseInstructions);

    async function handleCapture() {
        if (!canCapture || capturing) return;
        try {
            setCapturing(true);
            setError(null);
            const snapshot = await onCapture(personaId);
            setAnnouncement(
                `Captured a participant from version ${snapshot.sourceRevisionNumber}.`
            );
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to capture the participant.'
            );
        } finally {
            setCapturing(false);
        }
    }

    if (!persona) return null;

    return (
        <section
            aria-labelledby="participant-snapshot-heading"
            className="mx-auto max-w-4xl px-6 pb-16"
        >
            <Card>
                <CardHeader>
                    <CardTitle
                        id="participant-snapshot-heading"
                        className="flex items-center gap-2"
                    >
                        <Camera className="h-5 w-5 text-action" />
                        Participant snapshot
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <p role="status" aria-live="polite" className="min-h-4 type-meta text-success">
                        {announcement}
                    </p>
                    {error && (
                        <p role="alert" className="rounded-control border border-danger/40 bg-danger-soft p-3 type-body text-danger">
                            {error}
                        </p>
                    )}

                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-group border border-action/40 bg-accent-soft p-4">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="font-medium text-ink">
                                    Next snapshot preview
                                </h3>
                                <span className="text-xs text-ink-muted">
                                    From active v{activeVersion}
                                </span>
                            </div>
                            <div className="mt-3 flex items-center gap-3">
                                <ParticipantMark
                                    participant={{
                                        id:
                                            persona.recordedParticipantId ??
                                            persona.personaId,
                                        name: persona.name,
                                        color: persona.color,
                                    }}
                                    size="sm"
                                />
                                <div>
                                    <p className="text-sm text-ink">{persona.name}</p>
                                    <p className="text-xs text-ink-muted">{persona.role}</p>
                                </div>
                            </div>
                            <div className="mt-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                                    Stack ids
                                </p>
                                <ul className="mt-1 space-y-1 text-xs text-ink-secondary">
                                    {stackList(persona.stackIds, labels).map((label) => (
                                        <li key={label}>{label}</li>
                                    ))}
                                    {persona.stackIds.length === 0 && (
                                        <li>No stack assignments</li>
                                    )}
                                </ul>
                            </div>
                            <details className="mt-3">
                                <summary className="cursor-pointer text-xs font-medium text-action">
                                    Read the composed system prompt
                                </summary>
                                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-control border border-separator bg-canvas/60 p-3 font-mono text-xs text-ink-secondary">
                                    {composed}
                                </pre>
                            </details>
                            {!baseInstructions && (
                                <p className="mt-3 text-xs text-warning">
                                    The approved base instructions are unavailable for
                                    this seed, so a new snapshot cannot be captured.
                                </p>
                            )}
                            <Button
                                onClick={() => void handleCapture()}
                                busy={capturing}
                                busyLabel="Capturing"
                                disabled={!canCapture}
                                className="mt-4"
                            >
                                <Camera className="mr-2 size-4" />
                                Capture participant snapshot
                            </Button>
                        </div>

                        {recordedParticipant ? (
                            <div className="rounded-group border border-separator bg-canvas/40 p-4">
                                <div className="flex items-center gap-2">
                                    <History className="h-4 w-4 text-ink-secondary" />
                                    <h3 className="font-medium text-ink">
                                        Participant vs persona template
                                    </h3>
                                </div>
                                <div className="mt-3 space-y-4 text-xs">
                                    <div>
                                        <p className="font-medium text-ink-secondary">
                                            {recordedParticipant.name}
                                        </p>
                                        <p className="text-ink-muted">
                                            {recordedParticipant.role} · meeting snapshot
                                        </p>
                                        <p className="mt-1 text-ink-muted">
                                            No source prompt version was stored for the
                                            meeting participant.
                                        </p>
                                        <p className="mt-2 text-ink-secondary">
                                            {recordedParticipant.persona_summary}
                                        </p>
                                        <ul className="mt-2 space-y-1 text-ink-muted">
                                            {recordedParticipant.stack_ids.map((id) => (
                                                <li key={id} className="flex items-center gap-1">
                                                    {boardStacks[id]?.scope === 'shared' ? (
                                                        <ShieldCheck className="h-3 w-3 text-success" />
                                                    ) : (
                                                        <Lock className="h-3 w-3 text-warning" />
                                                    )}
                                                    {boardStacks[id]?.label ?? id}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="border-t border-separator pt-3">
                                        <p className="font-medium text-ink-secondary">
                                            {persona.name}
                                        </p>
                                        <p className="text-ink-muted">
                                            {persona.role} · persona template, active v
                                            {activeVersion}
                                        </p>
                                        <p className="mt-2 text-ink-secondary">
                                            {activeRevision?.prompt}
                                        </p>
                                        <ul className="mt-2 space-y-1 text-ink-muted">
                                            {stackList(persona.stackIds, labels).map((label) => (
                                                <li key={label}>{label}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-group border border-separator bg-canvas/40 p-4 text-sm text-ink-secondary">
                                <h3 className="font-medium text-ink">
                                    No meeting participant link
                                </h3>
                                <p className="mt-2">
                                    This persona template has no meeting
                                    counterpart, so it can only preview and
                                    capture new participant snapshots.
                                </p>
                            </div>
                        )}
                    </div>

                    <div>
                        <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
                            <CheckCircle2 className="h-4 w-4 text-success" />
                            Captured participant snapshots ({snapshots.length})
                        </h3>
                        {snapshots.length === 0 ? (
                            <p className="mt-2 text-sm text-ink-muted">
                                No participant snapshots captured yet.
                            </p>
                        ) : (
                            <ul className="mt-3 space-y-2">
                                {snapshots.map((snapshot) => (
                                    <li
                                        key={snapshot.snapshotId}
                                        className="rounded-control border border-separator bg-canvas/40 p-3"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-sm text-ink">
                                                {snapshot.name}
                                            </span>
                                            <span className="text-xs text-ink-muted">
                                                from v{snapshot.sourceRevisionNumber} ·{' '}
                                                {new Date(snapshot.createdAt).toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-ink-muted">
                                            {snapshot.role} ·{' '}
                                            {stackList(snapshot.stackIds, labels).join(', ') ||
                                                'No stack assignments'}
                                        </p>
                                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-ink-secondary">
                                            {snapshot.composedPrompt}
                                        </pre>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}
