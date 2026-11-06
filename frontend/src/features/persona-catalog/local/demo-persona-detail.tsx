'use client';

import Link from 'next/link';
import { markTutorialFact, useAnchorRef } from "@/features/demo-tutorial";
import { useCallback } from 'react';
import { useDemoWorkspace } from '@/features/demo-workspace';
import { PersonaEditorScreen } from '../presentation/persona-editor-screen';
import { DemoCatalogGate } from './demo-catalog-gate';
import { DemoSnapshotPanel, type BoardStackView, type RecordedParticipantView } from './demo-snapshot-panel';
import { useLocalPersonaCatalog } from './use-local-persona-catalog';

export function DemoPersonaDetail({
    personaId,
    initialTab = 'overview',
    boardParticipants,
    boardStacks,
}: {
    personaId: string;
    initialTab?: 'overview' | 'prompt';
    boardParticipants?: RecordedParticipantView[];
    boardStacks?: Record<string, BoardStackView>;
}) {
    return (
        <DemoCatalogGate>
            <Content
                personaId={personaId}
                initialTab={initialTab}
                boardParticipants={boardParticipants}
                boardStacks={boardStacks}
            />
        </DemoCatalogGate>
    );
}

function Content({
    personaId,
    initialTab,
    boardParticipants,
    boardStacks,
}: {
    personaId: string;
    initialTab: 'overview' | 'prompt';
    boardParticipants?: RecordedParticipantView[];
    boardStacks?: Record<string, BoardStackView>;
}) {
    const { seed } = useDemoWorkspace();
    const promptTabRef = useAnchorRef('persona.prompt');
    const revisionRef = useAnchorRef('persona.history');
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
    const recordedParticipant = template?.recordedParticipantId
        ? boardParticipants?.find(
              (participant) =>
                  participant.participant_id === template.recordedParticipantId
          ) ?? null
        : null;

    return (
        <div className="min-h-full text-ink">
            <div className="border-b border-separator bg-surface/40 px-4 py-3">
                <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 text-xs text-ink-secondary">
                    <p>
                        Practice template from the prepared board. The recorded
                        participants and their replies are unchanged.
                    </p>
                    <Link
                        href="/demo"
                        className="rounded-md border border-control px-3 py-1.5 text-ink hover:bg-surface-raised"
                    >
                        Back to the recorded meeting
                    </Link>
                </div>
            </div>
            <PersonaEditorScreen
                personaId={personaId}
                markId={template?.recordedParticipantId ?? undefined}
                client={client}
                loadStacks={loadStacks}
                routes={{ roster: '/demo/roster' }}
                initialTab={initialTab}
                description={template?.description}
                revisionNotes={revisionNotes}
                revisionBadges={revisionBadges}
                historyNote="Seeded dates are authored practice history, not model runs. Revisions captured in this tab are temporary."
                onTabChange={(tab) => {
                    if (tab === 'prompt') markTutorialFact('persona.prompt');
                }}
                onViewRevision={() => markTutorialFact('persona.revision')}
                promptTabAnchor={promptTabRef}
                viewRevisionAnchor={revisionRef}
            />
            {template ? (
                <DemoSnapshotPanel
                    personaId={personaId}
                    personas={personas}
                    stacks={stacks}
                    baseInstructions={baseInstructions}
                    snapshots={snapshots}
                    recordedParticipant={recordedParticipant}
                    boardStacks={boardStacks}
                    onCapture={captureSnapshot}
                />
            ) : null}
        </div>
    );
}
