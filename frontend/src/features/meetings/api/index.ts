/**
 * Public interface of the meetings feature api (spec-05).
 *
 * Other code consumes the feature through this barrel only — query keys
 * never escape to a global registry, and consumers never import the
 * internal decoder modules directly.
 */
export { meetingKeys } from './keys';
export { meetingClient, type MeetingCreateInput } from './client';
export { useMeeting, useMeetingList } from './queries';
export {
    useArchiveMeeting,
    useCreateMeeting,
    useDeleteMeeting,
    useUnarchiveMeeting,
} from './mutations';
export { closingKeys } from './closing-keys';
export { closingClient } from './closing-client';
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
} from './closing-decoders';
export { useClosing } from './closing-queries';
export {
    createClosingRequestKey,
    useAbortClosing,
    useRequestClosing,
    useRetryClosing,
    type RequestClosingVariables,
} from './closing-mutations';
export {
    useClosingObservation,
    type UseClosingObservationOptions,
    type UseClosingObservationResult,
} from './use-closing-observation';
export type { AIParticipant, Meeting, MeetingStatus, MeetingWithParticipants, Message } from './decoders';
