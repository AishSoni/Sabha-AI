'use client';

/**
 * Meeting-shared documents tab. Meetings consumes the Knowledge feature's
 * public DocumentPanel and never edits Knowledge internals. The panel owns
 * upload observation and deletion for this meeting's shared scope.
 */
import { useMeetingStore } from '@/stores/meetingStore';
import { DocumentPanel } from '@/features/knowledge';

export function SharedDocumentsTab() {
    const { currentMeeting } = useMeetingStore();

    if (!currentMeeting?.id) {
        return (
            <p className="p-6 text-center text-sm text-zinc-500">
                Select a meeting to manage its shared documents.
            </p>
        );
    }

    return (
        <div className="p-2">
            <DocumentPanel
                scope={{ meetingId: currentMeeting.id }}
                title="Shared Documents"
                description="These files are visible to every participant in this meeting once indexing is confirmed."
            />
        </div>
    );
}
