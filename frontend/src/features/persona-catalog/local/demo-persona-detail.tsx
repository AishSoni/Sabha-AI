'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { useDemoWorkspace } from '@/features/demo-workspace';
import { useReplayRun } from '@/features/meetings/runtime/replay-run';
import { PersonaEditorScreen } from '../presentation/persona-editor-screen';
import { DemoCatalogGate } from './demo-catalog-gate';
import { DemoSnapshotPanel, type BoardStackView, type RecordedParticipantView } from './demo-snapshot-panel';
import { useLocalPersonaCatalog } from './use-local-persona-catalog';

export function DemoPersonaDetail({
    personaId,
    initialTab = 'overview',
}: {
    personaId: string;
    initialTab?: 'overview' | 'prompt';
}) {
    return (
        <DemoCatalogGate>
            <Content personaId={personaId} initialTab={initialTab} />
        </DemoCatalogGate>
    );
}

function Content({
    personaId,
    initialTab,
}: {
    personaId: string;
    initialTab: 'overview' | 'prompt';
}) {
    const { seed } = useDemoWorkspace();
    const run = useReplayRun();
    const {
        client,
        personas,
        stacks,
        baseInstructions,
        snapshots,
        revisionNotes,
        revisionBadges,
        captureSnapshot,
    } = useLocalPersonaCatalog();
    const loadStacks = useCallback(async () => stacks, [stacks]);
    const template = seed?.personas.find(
        (persona) => persona.personaId === personaId
    );
    const board = (run.safeConfig as {
        board?: {
            participants?: RecordedParticipantView[];
            stacks?: Record<string, BoardStackView>;
        };
    } | null)?.board;
    const recordedParticipant = template?.recordedParticipantId
        ? board?.participants?.find(
              (participant) =>
                  participant.participant_id === template.recordedParticipantId
          ) ?? null
        : null;

    return (
        <div className="min-h-screen bg-zinc-950">
            <div className="border-b border-zinc-800 bg-zinc-900/40 px-4 py-3">
                <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                    <p>
                        Practice template from the prepared board. The recorded
                        participants and their replies are unchanged.
                    </p>
                    <Link
                        href="/demo"
                        className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:bg-zinc-900"
                    >
                        Back to the recorded meeting
                    </Link>
                </div>
            </div>
            <PersonaEditorScreen
                personaId={personaId}
                client={client}
                loadStacks={loadStacks}
                routes={{ roster: '/demo/roster' }}
                initialTab={initialTab}
                description={template?.description}
                revisionNotes={revisionNotes}
                revisionBadges={revisionBadges}
            />
            {template ? (
                <DemoSnapshotPanel
                    personaId={personaId}
                    personas={personas}
                    stacks={stacks}
                    baseInstructions={baseInstructions}
                    snapshots={snapshots}
                    recordedParticipant={recordedParticipant}
                    boardStacks={board?.stacks}
                    onCapture={captureSnapshot}
                />
            ) : null}
        </div>
    );
}
