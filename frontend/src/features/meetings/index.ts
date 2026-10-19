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
export type { AIParticipant, Meeting, MeetingStatus, MeetingWithParticipants, Message } from './api/decoders';
