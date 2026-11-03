'use client';

import { useState } from 'react';
import { Camera, CheckCircle2, History, Lock, ShieldCheck } from 'lucide-react';
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
                `Captured a practice participant from version ${snapshot.sourceRevisionNumber}.`
            );
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to capture the practice participant.'
            );
        } finally {
            setCapturing(false);
        }
    }

    if (!persona) return null;

    return (
        <section
            aria-labelledby="practice-snapshot-heading"
            className="mx-auto max-w-4xl px-6 pb-16"
        >
            <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                    <CardTitle
                        id="practice-snapshot-heading"
                        className="flex items-center gap-2 text-white"
                    >
                        <Camera className="h-5 w-5 text-indigo-400" />
                        Practice participant snapshot
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <p role="status" aria-live="polite" className="text-xs text-emerald-400 min-h-4">
                        {announcement}
                    </p>
                    {error && (
                        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                            {error}
                        </p>
                    )}

                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="font-medium text-white">
                                    Next snapshot preview
                                </h3>
                                <span className="text-xs text-zinc-500">
                                    From active v{activeVersion}
                                </span>
                            </div>
                            <div className="mt-3 flex items-center gap-3">
                                <span
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: persona.color }}
                                    aria-hidden="true"
                                />
                                <div>
                                    <p className="text-sm text-white">{persona.name}</p>
                                    <p className="text-xs text-zinc-500">{persona.role}</p>
                                </div>
                            </div>
                            <div className="mt-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                                    Stack ids
                                </p>
                                <ul className="mt-1 space-y-1 text-xs text-zinc-400">
                                    {stackList(persona.stackIds, labels).map((label) => (
                                        <li key={label}>{label}</li>
                                    ))}
                                    {persona.stackIds.length === 0 && (
                                        <li>No stack assignments</li>
                                    )}
                                </ul>
                            </div>
                            <details className="mt-3">
                                <summary className="cursor-pointer text-xs font-medium text-indigo-300">
                                    Read the composed system prompt
                                </summary>
                                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-xs text-zinc-300">
                                    {composed}
                                </pre>
                            </details>
                            {!baseInstructions && (
                                <p className="mt-3 text-xs text-amber-300">
                                    The approved base instructions are unavailable for
                                    this seed, so a new snapshot cannot be captured.
                                </p>
                            )}
                            <Button
                                onClick={() => void handleCapture()}
                                disabled={!canCapture || capturing}
                                className="mt-4 bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Camera className="mr-2 h-4 w-4" />
                                {capturing ? 'Capturing…' : 'Capture practice snapshot'}
                            </Button>
                        </div>

                        {recordedParticipant ? (
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                                <div className="flex items-center gap-2">
                                    <History className="h-4 w-4 text-zinc-400" />
                                    <h3 className="font-medium text-white">
                                        Prepared participant vs practice template
                                    </h3>
                                </div>
                                <div className="mt-3 space-y-4 text-xs">
                                    <div>
                                        <p className="font-medium text-zinc-300">
                                            {recordedParticipant.name}
                                        </p>
                                        <p className="text-zinc-500">
                                            {recordedParticipant.role} · recorded snapshot
                                        </p>
                                        <p className="mt-1 text-zinc-500">
                                            No source prompt version was stored for the
                                            prepared participant.
                                        </p>
                                        <p className="mt-2 text-zinc-400">
                                            {recordedParticipant.persona_summary}
                                        </p>
                                        <ul className="mt-2 space-y-1 text-zinc-500">
                                            {recordedParticipant.stack_ids.map((id) => (
                                                <li key={id} className="flex items-center gap-1">
                                                    {boardStacks[id]?.scope === 'shared' ? (
                                                        <ShieldCheck className="h-3 w-3 text-emerald-400" />
                                                    ) : (
                                                        <Lock className="h-3 w-3 text-amber-400" />
                                                    )}
                                                    {boardStacks[id]?.label ?? id}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="border-t border-zinc-800 pt-3">
                                        <p className="font-medium text-zinc-300">
                                            {persona.name}
                                        </p>
                                        <p className="text-zinc-500">
                                            {persona.role} · practice template, active v
                                            {activeVersion}
                                        </p>
                                        <p className="mt-2 text-zinc-400">
                                            {activeRevision?.prompt}
                                        </p>
                                        <ul className="mt-2 space-y-1 text-zinc-500">
                                            {stackList(persona.stackIds, labels).map((label) => (
                                                <li key={label}>{label}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-400">
                                <h3 className="font-medium text-white">
                                    No prepared participant link
                                </h3>
                                <p className="mt-2">
                                    This practice template has no recorded
                                    counterpart, so it can only preview and
                                    capture new practice snapshots.
                                </p>
                            </div>
                        )}
                    </div>

                    <div>
                        <h3 className="flex items-center gap-2 text-sm font-medium text-white">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            Captured practice snapshots ({snapshots.length})
                        </h3>
                        {snapshots.length === 0 ? (
                            <p className="mt-2 text-sm text-zinc-500">
                                No practice snapshots captured yet.
                            </p>
                        ) : (
                            <ul className="mt-3 space-y-2">
                                {snapshots.map((snapshot) => (
                                    <li
                                        key={snapshot.snapshotId}
                                        className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-sm text-white">
                                                {snapshot.name}
                                            </span>
                                            <span className="text-xs text-zinc-500">
                                                from v{snapshot.sourceRevisionNumber} ·{' '}
                                                {new Date(snapshot.createdAt).toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-zinc-500">
                                            {snapshot.role} ·{' '}
                                            {stackList(snapshot.stackIds, labels).join(', ') ||
                                                'No stack assignments'}
                                        </p>
                                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-zinc-400">
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
