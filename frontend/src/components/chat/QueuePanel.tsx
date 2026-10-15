'use client';

import { useEffect, useState } from 'react';
import { useMeetingStore } from '@/stores/meetingStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pencil, Trash2, Loader2, ListOrdered, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_CHARS = 4000;

/**
 * Pending message queue. Content here is server-authoritative: entries show
 * FIFO position and pending state, edits require the entry revision, and a
 * conflict never overwrites the user's unsaved draft.
 */
export function QueuePanel() {
    const {
        currentMeeting,
        queueEntries,
        queueStatus,
        queueError,
        fetchQueue,
        editQueueEntry,
        removeQueueEntry,
    } = useMeetingStore();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [draftError, setDraftError] = useState<string | null>(null);

    useEffect(() => {
        if (currentMeeting && currentMeeting.status === 'active') {
            void fetchQueue();
        }
    }, [currentMeeting?.id, currentMeeting?.status, fetchQueue]);

    if (!currentMeeting || currentMeeting.status !== 'active') return null;

    const startEdit = (entryId: string, content: string) => {
        setEditingId(entryId);
        setDraft(content);
        setDraftError(null);
    };

    const saveEdit = async (entryId: string) => {
        const text = draft.trim();
        if (!text) {
            setDraftError('Message cannot be empty.');
            return;
        }
        if (text.length > MAX_CHARS) {
            setDraftError(`Message is too long (${text.length}/${MAX_CHARS} characters).`);
            return;
        }
        const ok = await editQueueEntry(entryId, text);
        if (ok) {
            setEditingId(null);
            setDraft('');
            setDraftError(null);
        } else {
            // Conflict text lives in queueError; keep the draft for retry/copy.
            setDraftError('Could not save — your draft is preserved below. Copy it before retrying.');
        }
    };

    return (
        <section aria-label="Pending messages" className="max-w-3xl mx-auto w-full mt-3">
            {queueEntries.length === 0 && queueStatus !== 'loading' ? null : (
                <Card className="bg-zinc-900/50 border-zinc-800 p-3">
                    <h3 className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-2">
                        <ListOrdered className="w-4 h-4" aria-hidden />
                        Pending ({queueEntries.length}/10) — sends in order when the turn finishes
                    </h3>
                    {queueStatus === 'loading' && (
                        <p className="text-xs text-zinc-500 flex items-center gap-2" role="status">
                            <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> Loading pending messages…
                        </p>
                    )}
                    <ol className="space-y-2">
                        {queueEntries.map((entry, idx) => (
                            <li key={entry.entryId} className="rounded-lg bg-zinc-800/60 border border-zinc-700/60 p-2">
                                <div className="flex items-start gap-2">
                                    <span
                                        aria-label={`Position ${idx + 1} of ${queueEntries.length}`}
                                        className="text-xs text-zinc-500 font-mono mt-1 shrink-0"
                                    >
                                        #{idx + 1}
                                    </span>
                                    {editingId === entry.entryId ? (
                                        <div className="flex-1">
                                            <label htmlFor={`queue-edit-${entry.entryId}`} className="sr-only">
                                                Edit pending message {idx + 1}
                                            </label>
                                            <textarea
                                                id={`queue-edit-${entry.entryId}`}
                                                value={draft}
                                                onChange={(e) => setDraft(e.target.value)}
                                                rows={2}
                                                maxLength={MAX_CHARS + 100}
                                                className="w-full rounded bg-zinc-900 border border-zinc-700 text-sm text-white p-2"
                                            />
                                            {draftError && (
                                                <p className="text-xs text-amber-400 mt-1" role="alert">{draftError}</p>
                                            )}
                                            <div className="flex gap-2 mt-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => void saveEdit(entry.entryId)}
                                                    disabled={queueStatus === 'saving'}
                                                >
                                                    {queueStatus === 'saving' ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                                                    ) : null}
                                                    Save
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => { setEditingId(null); setDraftError(null); }}
                                                >
                                                    <X className="w-3 h-3 mr-1" aria-hidden /> Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="flex-1 text-sm text-zinc-200 whitespace-pre-wrap">{entry.content}</p>
                                    )}
                                    {editingId !== entry.entryId && (
                                        <div className="flex gap-1 shrink-0">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                aria-label={`Edit pending message ${idx + 1}`}
                                                onClick={() => startEdit(entry.entryId, entry.content)}
                                            >
                                                <Pencil className="w-3 h-3" aria-hidden />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                aria-label={`Remove pending message ${idx + 1}`}
                                                onClick={() => void removeQueueEntry(entry.entryId)}
                                            >
                                                <Trash2 className="w-3 h-3" aria-hidden />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                </Card>
            )}
            {queueError && (
                <p className={cn('text-xs mt-2', 'text-amber-400')} role="alert">{queueError}</p>
            )}
        </section>
    );
}
