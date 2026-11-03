/**
 * Presentation-safe meetings surface (spec-30).
 *
 * The demo shell observes the recorded runtime through this entry: replay
 * run/checkpoint state, chapter links, and runtime-scoped log reads. It is
 * deliberately separate from the root barrel, which also binds live HTTP
 * clients, provider credentials, and the live runtime.
 */
export type { ReplayBeat, ReplayBeatStep } from '../runtime/contract';
export { chapterHref } from '../runtime/chapters';
export { useMeetingsRuntime } from '../runtime/context';
export { useReplayRun } from '../runtime/replay-run';
export {
    useRuntimeConsensus,
    useRuntimeDisagreements,
} from '../runtime/hooks';
