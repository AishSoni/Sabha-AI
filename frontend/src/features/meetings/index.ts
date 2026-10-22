/**
 * Public interface of the meetings feature (spec-05).
 *
 * Route files, other features, and future screens consume the feature
 * through this curated barrel only — no wildcard exports, no deep imports
 * into sibling feature internals, and query keys stay owned here.
 */
export { meetingKeys } from './api/keys';
export { meetingClient, type MeetingCreateInput } from './api/client';
export { useMeeting, useMeetingList } from './api/queries';
export {
    useArchiveMeeting,
    useCreateMeeting,
    useDeleteMeeting,
    useUnarchiveMeeting,
} from './api/mutations';
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
export type { TurnGenerationSettings } from './api/turn-client';
export type { TurnOperation, TurnStatus } from './api/turn-decoders';
export type { TurnProjection, TurnToolProjection } from './api/turn-projection';
export type { AIParticipant, Meeting, MeetingStatus, MeetingWithParticipants, Message } from './api/decoders';
