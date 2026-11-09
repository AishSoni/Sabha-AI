'use client';

/**
 * Shared create-meeting presentation (spec-05, spec-25).
 *
 * The live route and the demo practice setup pass the same structural values
 * into this screen. Live composition keeps the native file input; the demo
 * replaces that one control with its approved-sample picker.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Bot,
    FileText,
    Loader2,
    RefreshCw,
    Upload,
    Users,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { ParticipantMark } from '@/components/identity/participant-mark';

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
    title: string;
    context: string;
    onTitleChange: (value: string) => void;
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
    /** Committed title/context/roster can no longer be edited. */
    configLocked?: boolean;
    /** Truthful partial-success copy shown after the meeting row exists. */
    partialNotice?: string | null;
    canContinue?: boolean;
    onContinue?: () => void;
    continueLabel?: string;
    /** Hide the create action once a meeting exists or its intent is committed. */
    showCreateAction?: boolean;
    isCreating: boolean;
    creationError?: string | null;
    navigationDone?: boolean;
    onCreate: () => void;
    onCancel?: () => void;
    canCreate?: boolean;
    heading?: string;
    description?: string;
    backHref?: string;
    backLabel?: string;
    createLabel?: string;
    busyLabel?: string;
    footerNote?: string;
    disclosure?: ReactNode;
}

export function MeetingCreationScreen({
    title,
    context,
    onTitleChange,
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
    configLocked = false,
    partialNotice,
    canContinue = false,
    onContinue,
    continueLabel = 'Continue to meeting',
    showCreateAction = true,
    isCreating,
    creationError,
    navigationDone = false,
    onCreate,
    onCancel,
    canCreate,
    heading = 'Create meeting',
    description = 'Set up a new AI advisory meeting',
    backHref = '/',
    backLabel = 'Back to home',
    createLabel = 'Create meeting',
    busyLabel = 'Creating meeting…',
    footerNote,
    disclosure,
}: MeetingCreationScreenProps) {
    const selectedCount = roster.filter((persona) => persona.selected).length;
    const everySelected = roster.length > 0 && roster.every((persona) => persona.selected);
    const ctaEnabled =
        canCreate ??
        (title.trim().length > 0 &&
            !configLocked &&
            !isCreating &&
            !navigationDone &&
            selectedCount > 0);

    return (
        <div className="min-h-full">
            <header className="material-chrome sticky top-0 z-chrome border-b border-separator">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href={backHref}
                            className="text-ink-secondary hover:text-ink transition-colors"
                            aria-label={backLabel}
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-ink">{heading}</h1>
                            <p className="text-xs text-ink-muted">{description}</p>
                        </div>
                    </div>
                </div>
            </header>

            <main id="main-content" className="max-w-4xl mx-auto px-6 py-8" tabIndex={-1}>
                {disclosure}

                {partialNotice ? (
                    <div
                        role="status"
                        className="mb-6 rounded-group border border-separator bg-surface-raised p-4 text-sm text-ink-secondary"
                    >
                        {partialNotice}
                    </div>
                ) : null}

                <div className="grid lg:grid-cols-[1fr,320px] gap-8">
                    <div className="space-y-8">
                        <section className="space-y-4">
                            <div>
                                <Label htmlFor="meeting-title" className="text-lg font-semibold text-ink">
                                    Meeting title <span className="text-danger">*</span>
                                </Label>
                                <p className="text-sm text-ink-muted mt-1">
                                    A concise name for this meeting
                                </p>
                            </div>
                            <Input
                                id="meeting-title"
                                placeholder="e.g., Product launch strategy for Q2"
                                value={title}
                                onChange={(event) => onTitleChange(event.target.value)}
                                disabled={configLocked}
                                className="h-12 text-lg"
                            />
                        </section>

                        <section className="space-y-4">
                            <div>
                                <Label htmlFor="context" className="text-lg font-semibold text-ink">
                                    Context
                                </Label>
                                <p className="text-sm text-ink-muted mt-1">
                                    Background, constraints, or questions for the participants
                                </p>
                            </div>
                            <Textarea
                                id="context"
                                placeholder="Provide additional context, background information, constraints, or specific questions you want addressed..."
                                value={context}
                                onChange={(event) => onContextChange(event.target.value)}
                                disabled={configLocked}
                                className="min-h-[150px]"
                            />
                            {configLocked ? (
                                <p className="text-xs text-ink-muted">
                                    The committed meeting title, context, and participants are
                                    frozen. New documents still join this meeting.
                                </p>
                            ) : null}
                        </section>

                        <section className="space-y-4">
                            <div>
                                <Label className="text-lg font-semibold text-ink">
                                    Documents
                                </Label>
                                <p className="text-sm text-ink-muted mt-1">
                                    Documents will be available for search by all participants
                                </p>
                            </div>
                            {uploadControl ?? (
                                <div className="m-control rounded-group border-2 border-dashed border-control bg-surface/30 p-8 text-center hover:border-action">
                                    <input
                                        type="file"
                                        multiple
                                        onChange={(event) => {
                                            if (event.target.files) {
                                                onFilesSelected?.(event.target.files);
                                            }
                                        }}
                                        className="hidden"
                                        id="file-upload"
                                        accept=".pdf,.docx,.xlsx,.csv,.txt,.md"
                                    />
                                    <label htmlFor="file-upload" className="cursor-pointer">
                                        <Upload className="w-10 h-10 text-ink-muted mx-auto mb-3" />
                                        <p className="text-sm text-ink-secondary">
                                            Click to upload documents
                                        </p>
                                        <p className="text-xs text-ink-muted mt-2">
                                            PDF, DOCX, XLSX, CSV, TXT, MD
                                        </p>
                                    </label>
                                </div>
                            )}

                            {stagedItems.length > 0 && (
                                <div className="space-y-2">
                                    {stagedItems.map((item, index) => (
                                        <div
                                            key={item.key}
                                            className="flex items-center gap-3 p-3 bg-surface-raised rounded-lg"
                                        >
                                            <FileText className="w-5 h-5 text-ink-muted shrink-0" />
                                            <span className="text-sm text-ink-secondary flex-1 truncate">
                                                {item.label}
                                            </span>
                                            {item.status === 'uploading' && (
                                                <span className="text-xs text-ink-secondary flex items-center gap-1">
                                                    <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" />
                                                    {item.statusLabel}
                                                </span>
                                            )}
                                            {item.status !== 'uploading' && item.statusLabel ? (
                                                <span
                                                    className={
                                                        item.status === 'failed'
                                                            ? 'text-xs text-danger'
                                                            : item.status === 'uploaded'
                                                              ? 'text-xs text-success'
                                                              : 'text-xs text-ink-secondary'
                                                    }
                                                >
                                                    {item.statusLabel}
                                                </span>
                                            ) : null}
                                            {item.removable ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onRemoveStaged(index)}
                                                    className="text-ink-muted hover:text-danger"
                                                    aria-label={`Remove ${item.label}`}
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            ) : null}
                                        </div>
                                    ))}
                                    {uploadError && (
                                        <p className="text-xs text-danger" role="alert">
                                            {uploadError}
                                        </p>
                                    )}
                                    {showRetryUploads && onRetryUploads && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={onRetryUploads}
                                            disabled={isCreating}
                                            className="text-xs"
                                        >
                                            <RefreshCw className="w-3 h-3 mr-2" />
                                            Retry Uploads
                                        </Button>
                                    )}
                                </div>
                            )}
                        </section>
                    </div>

                    <div className="lg:sticky lg:top-24 lg:self-start">
                        <Card>
                            <CardContent className="p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Users className="w-5 h-5 text-action" />
                                        <Label className="text-ink font-semibold">
                                            Participants
                                        </Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={onSelectAll}
                                            disabled={configLocked}
                                            className="text-xs text-ink-secondary hover:text-ink h-7"
                                        >
                                            {everySelected ? 'Deselect All' : 'Select All'}
                                        </Button>
                                        {onRefreshRoster ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={onRefreshRoster}
                                                disabled={loadingRoster}
                                                aria-label="Refresh participant roster"
                                                aria-busy={loadingRoster}
                                                className="text-ink-secondary hover:text-ink h-7 px-2"
                                            >
                                                <RefreshCw className={`w-3 h-3 ${loadingRoster ? 'animate-spin motion-reduce:animate-none' : ''}`} />
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>

                                <p className="text-xs text-ink-muted">
                                    Select which participants should join ({selectedCount} selected)
                                </p>

                                {loadingRoster ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-6 h-6 animate-spin motion-reduce:animate-none text-ink-muted" />
                                    </div>
                                ) : roster.length === 0 ? (
                                    <div className="text-center py-8 border border-dashed border-control rounded-lg">
                                        <Bot className="w-8 h-8 mx-auto text-ink-muted mb-2" />
                                        <p className="text-sm text-ink-muted">No personas available</p>
                                        <Link href={rosterNewHref} className="text-xs text-action hover:underline mt-2 inline-block">
                                            Create a persona first →
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                        {roster.map((persona) => (
                                            <label
                                                key={persona.id}
                                                className={`m-state flex items-center gap-3 rounded-control border p-3 ${configLocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${persona.selected
                                                    ? 'border-action bg-surface-selected'
                                                    : 'border-separator bg-surface/50'
                                                    }`}
                                                aria-disabled={configLocked}
                                            >
                                                <Checkbox
                                                    checked={persona.selected}
                                                    disabled={configLocked}
                                                    onCheckedChange={() => onToggleRoster(persona.id)}
                                                />
                                                <ParticipantMark
                                                    participant={{
                                                        id: persona.id,
                                                        name: persona.name,
                                                        color: persona.color,
                                                    }}
                                                    size="sm"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-ink truncate">{persona.name}</p>
                                                    {persona.subtitle && (
                                                        <p className="text-xs text-ink-muted truncate">Role: {persona.subtitle}</p>
                                                    )}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <div className="mt-12 flex items-center justify-end gap-4 border-t border-separator pt-8">
                    {creationError && (
                        <p className="text-sm text-danger flex-1" role="alert">
                            {creationError}
                        </p>
                    )}
                    {onCancel ? (
                        <Button
                            variant="ghost"
                            onClick={onCancel}
                            className="text-ink-secondary"
                        >
                            Cancel
                        </Button>
                    ) : null}
                    {canContinue && onContinue ? (
                        <Button onClick={onContinue} className="px-8">
                            {continueLabel}
                        </Button>
                    ) : null}
                    {showCreateAction ? (
                        <Button
                            onClick={onCreate}
                            busy={isCreating}
                            busyLabel={busyLabel}
                            disabled={!ctaEnabled}
                            className="px-8"
                        >
                            {createLabel}
                        </Button>
                    ) : null}
                </div>
                {footerNote ? (
                    <p className="mt-3 text-right text-xs text-ink-muted">{footerNote}</p>
                ) : null}
            </main>
        </div>
    );
}
