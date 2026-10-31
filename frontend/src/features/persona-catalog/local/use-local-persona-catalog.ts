'use client';

/**
 * Demo adapter for the shared persona catalog (spec-24).
 *
 * It binds the base app's persona client to the in-memory request transport
 * and exposes the workspace stack registry and seeded revision annotations.
 */
import { useCallback, useMemo } from 'react';
import {
    useDemoWorkspace,
    type LocalParticipantSnapshot,
    type WorkspaceLocalState,
} from '@/features/demo-workspace';
import { createPersonaClient, type PersonaCatalogClient } from '../model/client';
import type { PersonaStackOption } from '../model/types';
import { captureSnapshot as captureSnapshotState } from './state';
import { createLocalPersonaRequest } from './transport';

export interface LocalPersonaCatalog {
    client: PersonaCatalogClient;
    personas: WorkspaceLocalState['personas'];
    stacks: PersonaStackOption[];
    baseInstructions: string | null;
    snapshots: LocalParticipantSnapshot[];
    revisionNotes: Record<string, string>;
    revisionBadges: Record<string, string>;
    captureSnapshot: (personaId: string) => Promise<LocalParticipantSnapshot>;
}

function newId(): string {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
        return cryptoApi.randomUUID();
    }
    return `local-${Math.random().toString(36).slice(2)}`;
}

export function useLocalPersonaCatalog(): LocalPersonaCatalog {
    const {
        local,
        seed,
        workspaceEpoch,
        commitLocal,
        getLocal,
        isCurrentEpoch,
    } = useDemoWorkspace();

    const baseInstructions = seed?.baseInstructions ?? null;

    const client = useMemo(
        () =>
            createPersonaClient(
                createLocalPersonaRequest({
                    getState: getLocal,
                    commit: commitLocal,
                    getEpoch: () => workspaceEpoch,
                    isCurrentEpoch,
                    baseInstructions,
                })
            ),
        // The client is stable across local edits but replaces on a workspace
        // reset/restart so mounted screens reload from the restored seed.
        [getLocal, commitLocal, isCurrentEpoch, workspaceEpoch, baseInstructions]
    );

    const stacks = useMemo<PersonaStackOption[]>(
        () =>
            local.stacks.map((stack) => ({
                id: stack.stackId,
                name: stack.label,
                description: stack.description,
                scope: stack.scope,
            })),
        [local.stacks]
    );

    const revisionNotes = useMemo(() => {
        const notes: Record<string, string> = {};
        for (const persona of local.personas) {
            for (const revision of persona.revisions) {
                notes[revision.revisionId] = revision.reason;
            }
        }
        return notes;
    }, [local.personas]);

    const revisionBadges = useMemo(() => {
        const badges: Record<string, string> = {};
        for (const persona of local.personas) {
            for (const revision of persona.revisions) {
                if (revision.origin === 'local') {
                    badges[revision.revisionId] = 'Temporary local edit';
                }
            }
        }
        return badges;
    }, [local.personas]);

    const captureSnapshot = useCallback(
        async (personaId: string): Promise<LocalParticipantSnapshot> => {
            await Promise.resolve();
            if (!isCurrentEpoch(workspaceEpoch)) {
                throw new Error(
                    'This workspace was reset; the participant snapshot was not saved.'
                );
            }

            let snapshot: LocalParticipantSnapshot | null = null;
            let failure: string | null = null;
            const outcome = commitLocal((current) => {
                const result = captureSnapshotState(
                    current,
                    personaId,
                    baseInstructions,
                    {
                        idFactory: newId,
                        clock: () => new Date().toISOString(),
                    }
                );
                if (!result.ok) {
                    failure = result.message;
                    return current;
                }
                snapshot = result.value.snapshot;
                return result.state;
            });
            if (!outcome.ok) throw new Error(outcome.message);
            if (failure) throw new Error(failure);
            if (!snapshot) throw new Error('The participant snapshot was not saved.');
            return snapshot;
        },
        [
            baseInstructions,
            commitLocal,
            isCurrentEpoch,
            workspaceEpoch,
        ]
    );

    return {
        client,
        personas: local.personas,
        stacks,
        baseInstructions,
        snapshots: local.participantSnapshots,
        revisionNotes,
        revisionBadges,
        captureSnapshot,
    };
}
