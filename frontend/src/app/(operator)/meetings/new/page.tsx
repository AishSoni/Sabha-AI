'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MeetingCreationScreen, useMeetingCreation } from '@/features/meetings';
import { usePersonaList } from '@/features/persona-catalog';

interface RosterItem {
    id: string;
    name: string;
    subtitle: string | null;
    color: string;
    selected: boolean;
}

export default function NewMeetingPage() {
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [context, setContext] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);

    const personaList = usePersonaList();
    const loadingRoster = personaList.isLoading;

    // The catalog query is the canonical owner of persona metadata; this
    // screen only records which identities the director selected. The first
    // catalog hydration keeps the all-selected default; later revisions keep
    // existing choices, drop identities that disappeared, and leave newly
    // added identities unselected. Returning `prev` unchanged avoids render
    // churn when a refresh only changes metadata.
    useEffect(() => {
        if (!personaList.data) return;
        const currentIds = new Set(personaList.data.personas.map(p => p.id));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedIds(prev => {
            if (prev === null) return currentIds;
            const retained = new Set([...prev].filter(id => currentIds.has(id)));
            return retained.size === prev.size ? prev : retained;
        });
    }, [personaList.data]);

    const roster = useMemo<RosterItem[]>(() => {
        const personas = personaList.data?.personas ?? [];
        return personas.map(p => ({
            id: p.id,
            name: p.name,
            subtitle: p.subtitle ?? null,
            color: p.color,
            selected: selectedIds === null ? true : selectedIds.has(p.id),
        }));
    }, [personaList.data, selectedIds]);

    /**
     * Document staging, meeting creation, upload retries, and one-shot
     * navigation live in the meetings feature creation hook so a failed
     * upload never discards the created meeting and a retry never clones it.
     */
    const {
        isCreating,
        uploads,
        committedConfig,
        configLocked,
        createdMeetingId,
        creationError,
        uploadError,
        navigationDone,
        canContinue,
        partialNotice,
        stageFiles,
        removeUpload,
        createMeeting,
        retryUploads,
        continueToMeeting,
    } = useMeetingCreation();

    const handleRosterToggle = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev ?? roster.map(p => p.id));
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAll = () => {
        const allSelected = roster.every(p => p.selected);
        setSelectedIds(allSelected ? new Set() : new Set(roster.map(p => p.id)));
    };

    /** The view model is title/context; the feature adapter maps them to the meeting name/agenda wire fields. */
    const handleCreate = async () => {
        const effectiveTitle = (committedConfig?.title ?? title).trim();
        if (!effectiveTitle) return;

        const selectedPersonaIds =
            committedConfig?.personaIds ?? roster.filter(p => p.selected).map(p => p.id);
        if (selectedPersonaIds.length === 0) return;

        await createMeeting({
            title: effectiveTitle,
            context: (committedConfig?.context ?? context).trim(),
            personaIds: selectedPersonaIds,
        });
    };

    return (
        <MeetingCreationScreen
            title={committedConfig?.title ?? title}
            context={committedConfig?.context ?? context}
            onTitleChange={setTitle}
            onContextChange={setContext}
            roster={roster}
            loadingRoster={loadingRoster}
            onToggleRoster={handleRosterToggle}
            onSelectAll={handleSelectAll}
            onRefreshRoster={() => void personaList.refetch()}
            configLocked={configLocked}
            stagedItems={uploads.map((item) => ({
                key: item.requestKey,
                label: item.file.name,
                status: item.status,
                statusLabel:
                    item.status === 'uploading'
                        ? 'Uploading…'
                        : item.status === 'uploaded'
                          ? 'Accepted — indexing'
                          : item.status === 'failed'
                            ? `Failed: ${item.error ?? 'Upload failed'}`
                            : 'Queued',
                removable: item.status === 'pending',
            }))}
            onRemoveStaged={removeUpload}
            onFilesSelected={stageFiles}
            uploadError={uploadError}
            onRetryUploads={retryUploads}
            showRetryUploads={Boolean(uploadError && createdMeetingId)}
            partialNotice={partialNotice}
            canContinue={canContinue}
            onContinue={continueToMeeting}
            showCreateAction={!createdMeetingId && !navigationDone}
            canCreate={
                !createdMeetingId &&
                !isCreating &&
                !navigationDone &&
                (committedConfig?.title ?? title).trim().length > 0 &&
                roster.some(persona => persona.selected)
            }
            createLabel={configLocked ? 'Retry meeting creation' : 'Create meeting'}
            isCreating={isCreating}
            creationError={creationError}
            navigationDone={navigationDone}
            onCreate={() => void handleCreate()}
            onCancel={() => router.back()}
        />
    );
}
