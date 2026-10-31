'use client';

import { useReplayRun } from '@/features/meetings/runtime/replay-run';
import {
    DemoPersonaDetail,
    type BoardStackView,
    type RecordedParticipantView,
} from '@/features/persona-catalog/local';

/**
 * App-level bridge that reads the prepared board and passes its immutable
 * participant snapshots into the demo catalog. The feature itself stays free
 * of cross-feature runtime imports.
 */
export function DemoPersonaRoute({
    personaId,
    initialTab = 'overview',
}: {
    personaId: string;
    initialTab?: 'overview' | 'prompt';
}) {
    const run = useReplayRun();
    const board = (
        run.safeConfig as {
            board?: {
                participants?: RecordedParticipantView[];
                stacks?: Record<string, BoardStackView>;
            };
        } | null
    )?.board;

    return (
        <DemoPersonaDetail
            personaId={personaId}
            initialTab={initialTab}
            boardParticipants={board?.participants}
            boardStacks={board?.stacks}
        />
    );
}
