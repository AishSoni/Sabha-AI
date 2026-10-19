/**
 * Derivation of the visible meeting summaries from persisted system
 * messages.
 *
 * Summaries are DATA derived from markers the backend writes — never
 * client-side mock text. This makes the list remount-safe (reload, revisit)
 * and free of cross-meeting or duplicate local state.
 *
 * Markers (backend-owned):
 *  - `📋 **MEETING SUMMARY**` — interim runtime summary,
 *  - `📋 **MEETING ENDED**`   — the final executive summary of an ending.
 */
import type { Message } from '@/lib/api';

export const INTERIM_SUMMARY_MARKER = '📋 **MEETING SUMMARY**';
export const FINAL_SUMMARY_MARKER = '📋 **MEETING ENDED**';

export interface MeetingSummaryView {
    id: string;
    number: number;
    content: string;
    createdAt: string;
    isFinal: boolean;
}

export function deriveSummariesFromMessages(
    messages: Message[] | undefined,
): MeetingSummaryView[] {
    if (!messages) return [];
    const summaries: MeetingSummaryView[] = [];
    for (const msg of messages) {
        if (msg.sender_type !== 'system') continue;
        if (msg.content.startsWith(INTERIM_SUMMARY_MARKER)) {
            summaries.push({
                id: msg.id,
                number: summaries.length + 1,
                content: msg.content.slice(INTERIM_SUMMARY_MARKER.length).trim(),
                createdAt: msg.created_at,
                isFinal: false,
            });
        } else if (msg.content.startsWith(FINAL_SUMMARY_MARKER)) {
            summaries.push({
                id: msg.id,
                number: summaries.length + 1,
                content: msg.content.slice(FINAL_SUMMARY_MARKER.length).trim(),
                createdAt: msg.created_at,
                isFinal: true,
            });
        }
    }
    return summaries;
}
