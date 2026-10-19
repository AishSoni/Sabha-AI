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
export type { AIParticipant, Meeting, MeetingStatus, MeetingWithParticipants, Message } from './decoders';
