'use client';

/**
 * Shared create-meeting presentation (spec-05, spec-25, spec-33).
 *
 * The live route and the demo practice setup pass the same structural values
 * into this screen. Live composition keeps the native file input; the demo
 * replaces that one control with its approved-sample picker.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
    FileText,
    Loader2,
    RefreshCw,
    Upload,
    Users,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { ParticipantMark } from '@/components/identity/participant-mark';
import { PageHeader, PageContainer } from '@/components/shell';

export interface MeetingCreationRosterItem {
    id: string;
    name: string;
    subtitle: string | null;
    color: string;
    selected: boolean;
}

export interface MeetingCreationStagedItem {
    key: string;
    label: string;
    status: 'pending' | 'uploading' | 'uploaded' | 'failed';
    statusLabel: string;
    removable: boolean;
}

export interface MeetingCreationScreenProps {
    agenda: string;
    context: string;
    onAgendaChange: (value: string) => void;
    onContextChange: (value: string) => void;
    roster: readonly MeetingCreationRosterItem[];
    loadingRoster: boolean;
    onToggleRoster: (id: string) => void;
    onSelectAll: () => void;
    onRefreshRoster?: () => void;
    rosterNewHref?: string;
    stagedItems: readonly MeetingCreationStagedItem[];
    onRemoveStaged: (index: number) => void;
    uploadControl?: ReactNode;
    onFilesSelected?: (files: FileList) => void;
    uploadError?: string | null;
    onRetryUploads?: () => void;
    showRetryUploads?: boolean;
    isCreating: boolean;
    creationError?: string | null;
    navigationDone?: boolean;
    onCreate: () => void;
    onCancel?: () => void;
    canCreate?: boolean;
    title?: string;
    description?: string;
    backHref?: string;
    backLabel?: string;
    createLabel?: string;
    busyLabel?: string;
    footerNote?: string;
    disclosure?: ReactNode;
}

export function MeetingCreationScreen({
    agenda,
    context,
    onAgendaChange,
    onContextChange,
    roster,
    loadingRoster,
    onToggleRoster,
    onSelectAll,
    onRefreshRoster,
    rosterNewHref = '/roster/new',
    stagedItems,
    onRemoveStaged,
    uploadControl,
    onFilesSelected,
    uploadError,
    onRetryUploads,
    showRetryUploads = false,
    isCreating,
    creationError,
    navigationDone = false,
    onCreate,
    onCancel,
    canCreate,
    title = 'Create Meeting Room',
    description = 'Set up a new AI advisory session',
    backHref = '/meetings',
    backLabel = 'Back to meetings',
    createLabel = 'Create Meeting Room',
    busyLabel = 'Creating...',
    footerNote,
    disclosure,
}: MeetingCreationScreenProps) {
    const agendaRef = useRef<HTMLInputElement>(null);
    const errorRef = useRef<HTMLParagraphElement>(null);
    const [agendaError, setAgendaError] = useState<string | null>(null);
    const selectedCount = roster.filter((persona) => persona.selected).length;
    const everySelected =
        roster.length > 0 && roster.every((persona) => persona.selected);
    const ctaEnabled =
        canCreate ??
        (agenda.trim().length > 0 &&
            !isCreating &&
            !navigationDone &&
            selectedCount > 0);

    useEffect(() => {
        if (creationError) errorRef.current?.focus();
    }, [creationError]);

    const submit = () => {
        if (!agenda.trim()) {
            setAgendaError('Enter a meeting agenda before creating the room.');
            agendaRef.current?.focus();
            return;
        }
        setAgendaError(null);
        onCreate();
    };

    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title={title}
                description={description}
                backHref={backHref}
                backLabel={backLabel}
            />
            <PageContainer>
                {disclosure}
                <div>
                    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
                        <div className="min-w-0 space-y-8">
                            <section aria-labelledby="agenda-heading">
                                <h2
                                    id="agenda-heading"
                                    className="sr-only"
                                >
                                    Agenda
                                </h2>
                                <FormField
                                    label="Meeting agenda"
                                    description="A concise title describing what this meeting is about."
                                    error={agendaError}
                                    required
                                >
                                    <Input
                                        ref={agendaRef}
                                        id="agenda"
                                        value={agenda}
                                        onChange={(event) => {
                                            setAgendaError(null);
                                            onAgendaChange(event.target.value);
                                        }}
                                        className="h-12 type-lead"
                                        aria-invalid={agendaError ? true : undefined}
                                    />
                                </FormField>
                                <p className="mt-2 type-meta text-ink-muted">
                                    Example: “Should we launch the Mumbai pilot
                                    in Q3, and what would make it a success?”
                                </p>
                            </section>

                            <section aria-labelledby="context-heading">
                                <h2
                                    id="context-heading"
                                    className="sr-only"
                                >
                                    Context
                                </h2>
                                <FormField
                                    label="Meeting context (optional)"
                                    description="Background, constraints, or the specific question you want the board to address."
                                >
                                    <Textarea
                                        id="context"
                                        value={context}
                                        onChange={(event) =>
                                            onContextChange(event.target.value)
                                        }
                                        className="min-h-[150px]"
                                    />
                                </FormField>
                            </section>

                            <section aria-labelledby="documents-heading">
                                <div className="mb-3">
                                    <h2
                                        id="documents-heading"
                                        className="type-section-title text-ink"
                                    >
                                        Shared documents
                                    </h2>
                                    <p className="mt-1 max-w-[68ch] type-body text-ink-secondary">
                                        Documents added here are shared with
                                        every participant in this meeting. They
                                        become readable after preparation
                                        finishes.
                                    </p>
                                </div>

                                {uploadControl ?? (
                                    <div className="m-control rounded-group border border-dashed border-control bg-surface/40 p-6 text-center transition-colors hover:border-action">
                                        <input
                                            type="file"
                                            multiple
                                            onChange={(event) => {
                                                if (event.target.files) {
                                                    onFilesSelected?.(
                                                        event.target.files
                                                    );
                                                }
                                            }}
                                            className="hidden"
                                            id="file-upload"
                                            accept=".pdf,.docx,.xlsx,.csv,.txt,.md"
                                        />
                                        <label
                                            htmlFor="file-upload"
                                            className="flex cursor-pointer flex-col items-center gap-2"
                                        >
                                            <Upload
                                                aria-hidden="true"
                                                className="size-7 text-ink-muted"
                                            />
                                            <span className="type-control text-ink">
                                                Choose documents
                                            </span>
                                            <span className="type-meta text-ink-muted">
                                                PDF, DOCX, XLSX, CSV, TXT, or MD
                                            </span>
                                        </label>
                                    </div>
                                )}

                                {stagedItems.length > 0 ? (
                                    <div className="mt-3 space-y-2">
                                        <p
                                            aria-live="polite"
                                            className="type-meta text-ink-muted"
                                        >
                                            {stagedItems.length} document
                                            {stagedItems.length === 1
                                                ? ''
                                                : 's'}{' '}
                                            staged
                                        </p>
                                        <ul className="material-raised divide-y divide-separator overflow-hidden rounded-group">
                                            {stagedItems.map((item, index) => (
                                                <li
                                                    key={item.key}
                                                    data-status={item.status}
                                                    className="flex items-center gap-3 p-3"
                                                >
                                                    <FileText
                                                        aria-hidden="true"
                                                        className="size-5 shrink-0 text-ink-muted"
                                                    />
                                                    <span className="min-w-0 flex-1 truncate type-body text-ink">
                                                        {item.label}
                                                    </span>
                                                    {item.status ===
                                                    'uploading' ? (
                                                        <span className="flex items-center gap-1 type-meta text-ink-secondary">
                                                            <Loader2
                                                                aria-hidden="true"
                                                                className="size-3 animate-spin motion-reduce:animate-none"
                                                            />
                                                            {item.statusLabel}
                                                        </span>
                                                    ) : item.statusLabel ? (
                                                        <span
                                                            className={
                                                                item.status ===
                                                                'failed'
                                                                    ? 'type-meta text-danger'
                                                                    : item.status ===
                                                                        'uploaded'
                                                                      ? 'type-meta text-success'
                                                                      : 'type-meta text-ink-secondary'
                                                            }
                                                        >
                                                            {item.statusLabel}
                                                        </span>
                                                    ) : null}
                                                    {item.removable ? (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            aria-label={`Remove ${item.label}`}
                                                            onClick={() =>
                                                                onRemoveStaged(
                                                                    index
                                                                )
                                                            }
                                                            className="text-ink-muted hover:text-danger"
                                                        >
                                                            <X aria-hidden="true" />
                                                        </Button>
                                                    ) : null}
                                                </li>
                                            ))}
                                        </ul>
                                        {uploadError ? (
                                            <p
                                                role="alert"
                                                className="type-meta text-danger"
                                            >
                                                {uploadError}
                                            </p>
                                        ) : null}
                                        {showRetryUploads &&
                                        onRetryUploads ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={onRetryUploads}
                                                disabled={isCreating}
                                            >
                                                <RefreshCw
                                                    aria-hidden="true"
                                                    className="size-3.5"
                                                />
                                                Retry uploads
                                            </Button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </section>
                        </div>

                        <aside
                            aria-labelledby="participants-heading"
                            className="material-raised h-fit min-w-0 rounded-group p-5 xl:sticky xl:top-20"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Users
                                        aria-hidden="true"
                                        className="size-4 text-ink-muted"
                                    />
                                    <h2
                                        id="participants-heading"
                                        className="type-section-title text-ink"
                                    >
                                        Participants
                                    </h2>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={onSelectAll}
                                        className="text-ink-secondary hover:text-ink"
                                    >
                                        {everySelected
                                            ? 'Deselect all'
                                            : 'Select all'}
                                    </Button>
                                    {onRefreshRoster ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={onRefreshRoster}
                                            disabled={loadingRoster}
                                            aria-label="Refresh personas"
                                        >
                                            <RefreshCw
                                                aria-hidden="true"
                                                className={
                                                    loadingRoster
                                                        ? 'animate-spin motion-reduce:animate-none'
                                                        : undefined
                                                }
                                            />
                                        </Button>
                                    ) : null}
                                </div>
                            </div>

                            <p className="mt-2 type-meta text-ink-secondary">
                                Select which AI advisors should participate (
                                {selectedCount} selected)
                            </p>

                            {loadingRoster ? (
                                <div
                                    role="status"
                                    className="mt-4 space-y-2"
                                >
                                    <span className="sr-only">
                                        Loading personas…
                                    </span>
                                    {Array.from({ length: 3 }, (_, index) => (
                                        <Skeleton
                                            key={index}
                                            className="h-14 w-full"
                                        />
                                    ))}
                                </div>
                            ) : roster.length === 0 ? (
                                <div className="mt-4 rounded-control border border-dashed border-control p-5 text-center">
                                    <p className="type-body text-ink-secondary">
                                        No personas available
                                    </p>
                                    <Link
                                        href={rosterNewHref}
                                        className="m-control mt-2 inline-flex min-h-9 items-center rounded-control type-control text-action outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                    >
                                        Create a persona first
                                    </Link>
                                </div>
                            ) : (
                                <div
                                    role="group"
                                    aria-label="Available personas"
                                    className="mt-4 max-h-[26rem] space-y-2 overflow-y-auto pr-1"
                                >
                                    {roster.map((persona) => (
                                        <label
                                            key={persona.id}
                                            htmlFor={`meeting-persona-${persona.id}`}
                                            className={`m-state flex min-h-14 cursor-pointer items-center gap-3 rounded-control border p-3 ${
                                                persona.selected
                                                    ? 'border-action bg-surface-selected'
                                                    : 'border-separator bg-surface/50'
                                            }`}
                                        >
                                            <Checkbox
                                                id={`meeting-persona-${persona.id}`}
                                                checked={persona.selected}
                                                onCheckedChange={() =>
                                                    onToggleRoster(persona.id)
                                                }
                                            />
                                            <ParticipantMark
                                                participant={{
                                                    id: persona.id,
                                                    name: persona.name,
                                                    color: persona.color,
                                                }}
                                                size="sm"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate type-control text-ink">
                                                    {persona.name}
                                                </span>
                                                {persona.subtitle ? (
                                                    <span className="block truncate type-meta text-ink-muted">
                                                        {persona.subtitle}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </aside>
                    </div>

                    <div className="mt-12 flex flex-wrap items-center justify-end gap-4 border-t border-separator pt-8">
                        {creationError ? (
                            <p
                                ref={errorRef}
                                tabIndex={-1}
                                className="min-w-0 flex-1 type-body text-danger outline-none"
                                role="alert"
                            >
                                {creationError}
                            </p>
                        ) : null}
                        {onCancel ? (
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={onCancel}
                                className="text-ink-secondary"
                            >
                                Cancel
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            onClick={submit}
                            busy={isCreating}
                            busyLabel={busyLabel}
                            disabled={!ctaEnabled}
                            className="px-8"
                        >
                            {createLabel}
                        </Button>
                    </div>
                    {footerNote ? (
                        <p className="mt-3 text-right type-meta text-ink-muted">
                            {footerNote}
                        </p>
                    ) : null}
                </div>
            </PageContainer>
        </main>
    );
}
