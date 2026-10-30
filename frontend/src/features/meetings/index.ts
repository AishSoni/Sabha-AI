/**
 * Public interface of the meetings feature (spec-05).
 *
 * Route files, other features, and future screens consume the feature
 * through this curated barrel only — no wildcard exports, no deep imports
 * into sibling feature internals, and query keys stay owned here.
 */
export { meetingKeys } from './api/keys';
export { meetingClient, type MeetingCreateInput } from './api/client';
export {
    useMeeting,
    useMeetingConsensus,
    useMeetingContextStats,
    useMeetingDisagreements,
    useMeetingList,
} from './api/queries';
export {
    useArchiveMeeting,
    useCreateMeeting,
    useDeleteMeeting,
    useGenerateSummary,
    useSendMessage,
    useUnarchiveMeeting,
    type GenerateSummaryVariables,
    type SendMessageVariables,
} from './api/mutations';
export { closingKeys } from './api/closing-keys';
export { closingClient } from './api/closing-client';
export {
    isPollingClosingStage,
    isSettledClosingStage,
    type ClosingMode,
    type ClosingReceipt,
    type ClosingStage,
    type ClosingSummarySettings,
    type ClosingView,
    type ClosingVote,
    type RequestClosingInput,
} from './api/closing-decoders';
export { useClosing } from './api/closing-queries';
export {
    createClosingRequestKey,
    useAbortClosing,
    useRequestClosing,
    useRetryClosing,
    type RequestClosingVariables,
} from './api/closing-mutations';
export {
    useClosingObservation,
    type UseClosingObservationOptions,
    type UseClosingObservationResult,
} from './api/use-closing-observation';
export {
    useMeetingCreation,
    type MeetingCreationInput,
    type MeetingUploadDraft,
} from './hooks/use-meeting-creation';
export {
    createTurnRequestKey,
    useMeetingTurnController,
    type MeetingTurnController,
} from './hooks/use-meeting-turn-controller';
export type { TurnGenerationSettings } from './api/generation-settings';
export type { TurnOperation, TurnStatus } from './api/turn-decoders';
export type { TurnProjection, TurnToolProjection } from './api/turn-projection';
export { clearLiveTurnProjections } from './api/turn-projection';
export { turnProjectionKey, useTurnProjectionStore } from './api/turn-projection';
export {
    ClosingPanel,
    type ClosingPanelProps,
} from './components/ClosingPanel';
export {
    MeetingRoom,
    type MeetingRoomProps,
} from './components/MeetingRoom';
export type {
    AIParticipant,
    Consensus,
    ContextStats,
    Disagreement,
    Meeting,
    MeetingStatus,
    MeetingWithParticipants,
    Message,
} from './api/decoders';
