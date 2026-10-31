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
    backHref = '/',
    createLabel = 'Create Meeting Room',
    busyLabel = 'Creating...',
    footerNote,
    disclosure,
}: MeetingCreationScreenProps) {
    const selectedCount = roster.filter((persona) => persona.selected).length;
    const everySelected = roster.length > 0 && roster.every((persona) => persona.selected);
    const ctaEnabled =
        canCreate ??
        (agenda.trim().length > 0 &&
            !isCreating &&
            !navigationDone &&
            selectedCount > 0);

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={backHref} className="text-zinc-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-white">{title}</h1>
                            <p className="text-xs text-zinc-500">{description}</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-6 py-8">
                {disclosure}

                <div className="grid lg:grid-cols-[1fr,320px] gap-8">
                    <div className="space-y-8">
                        <section className="space-y-4">
                            <div>
                                <Label htmlFor="agenda" className="text-lg font-semibold text-white">
                                    Meeting Agenda <span className="text-red-400">*</span>
                                </Label>
                                <p className="text-sm text-zinc-500 mt-1">
                                    A concise title describing what this meeting is about
                                </p>
                            </div>
                            <Input
                                id="agenda"
                                placeholder="e.g., Product launch strategy for Q2"
                                value={agenda}
                                onChange={(event) => onAgendaChange(event.target.value)}
                                className="bg-zinc-900 border-zinc-700 text-white text-lg h-12"
                            />
                        </section>

                        <section className="space-y-4">
                            <div>
                                <Label htmlFor="context" className="text-lg font-semibold text-white">
                                    Meeting Context
                                </Label>
                                <p className="text-sm text-zinc-500 mt-1">
                                    Extra details to help the AI advisors understand the situation
                                </p>
                            </div>
                            <Textarea
                                id="context"
                                placeholder="Provide additional context, background information, constraints, or specific questions you want addressed..."
                                value={context}
                                onChange={(event) => onContextChange(event.target.value)}
                                className="bg-zinc-900 border-zinc-700 text-white min-h-[150px]"
                            />
                        </section>

                        <section className="space-y-4">
                            <div>
                                <Label className="text-lg font-semibold text-white">
                                    Shared Documents
                                </Label>
                                <p className="text-sm text-zinc-500 mt-1">
                                    Documents will be available for RAG search by all AI advisors
                                </p>
                            </div>
                            {uploadControl ?? (
                                <div className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center hover:border-zinc-600 transition-colors bg-zinc-900/30">
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
                                        <Upload className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
                                        <p className="text-sm text-zinc-400">
                                            Click to upload documents
                                        </p>
                                        <p className="text-xs text-zinc-600 mt-2">
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
                                            className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg"
                                        >
                                            <FileText className="w-5 h-5 text-zinc-500 shrink-0" />
                                            <span className="text-sm text-zinc-300 flex-1 truncate">
                                                {item.label}
                                            </span>
                                            {item.status === 'uploading' && (
                                                <span className="text-xs text-zinc-400 flex items-center gap-1">
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    {item.statusLabel}
                                                </span>
                                            )}
                                            {item.status !== 'uploading' && item.statusLabel ? (
                                                <span
                                                    className={
                                                        item.status === 'failed'
                                                            ? 'text-xs text-red-400'
                                                            : item.status === 'uploaded'
                                                              ? 'text-xs text-green-400'
                                                              : 'text-xs text-zinc-400'
                                                    }
                                                >
                                                    {item.statusLabel}
                                                </span>
                                            ) : null}
                                            {item.removable ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onRemoveStaged(index)}
                                                    className="text-zinc-500 hover:text-red-400"
                                                    aria-label={`Remove ${item.label}`}
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            ) : null}
                                        </div>
                                    ))}
                                    {uploadError && (
                                        <p className="text-xs text-amber-400" role="alert">
                                            {uploadError}
                                        </p>
                                    )}
                                    {showRetryUploads && onRetryUploads && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={onRetryUploads}
                                            disabled={isCreating}
                                            className="text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800"
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
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardContent className="p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Users className="w-5 h-5 text-indigo-400" />
                                        <Label className="text-white font-semibold">
                                            AI Roster
                                        </Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={onSelectAll}
                                            className="text-xs text-zinc-400 hover:text-white h-7"
                                        >
                                            {everySelected ? 'Deselect All' : 'Select All'}
                                        </Button>
                                        {onRefreshRoster ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={onRefreshRoster}
                                                disabled={loadingRoster}
                                                className="text-zinc-400 hover:text-white h-7 px-2"
                                            >
                                                <RefreshCw className={`w-3 h-3 ${loadingRoster ? 'animate-spin' : ''}`} />
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>

                                <p className="text-xs text-zinc-500">
                                    Select which AI advisors should participate ({selectedCount} selected)
                                </p>

                                {loadingRoster ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                                    </div>
                                ) : roster.length === 0 ? (
                                    <div className="text-center py-8 border border-dashed border-zinc-700 rounded-lg">
                                        <Bot className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                                        <p className="text-sm text-zinc-500">No personas available</p>
                                        <Link href={rosterNewHref} className="text-xs text-indigo-400 hover:underline mt-2 inline-block">
                                            Create a persona first →
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                        {roster.map((persona) => (
                                            <div
                                                key={persona.id}
                                                className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${persona.selected
                                                    ? 'bg-zinc-800 border-zinc-600'
                                                    : 'bg-zinc-900/50 border-zinc-800 opacity-60'
                                                    }`}
                                                onClick={() => onToggleRoster(persona.id)}
                                            >
                                                <Checkbox
                                                    checked={persona.selected}
                                                    onClick={(event) => event.stopPropagation()}
                                                    onCheckedChange={() => onToggleRoster(persona.id)}
                                                    className="border-zinc-600"
                                                />
                                                <div
                                                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                                    style={{ backgroundColor: persona.color }}
                                                >
                                                    <Bot className="w-4 h-4 text-white" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{persona.name}</p>
                                                    {persona.subtitle && (
                                                        <p className="text-xs text-zinc-500 truncate">{persona.subtitle}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <div className="mt-12 flex items-center justify-end gap-4 border-t border-zinc-800 pt-8">
                    {creationError && (
                        <p className="text-sm text-red-400 flex-1" role="alert">
                            {creationError}
                        </p>
                    )}
                    {onCancel ? (
                        <Button
                            variant="ghost"
                            onClick={onCancel}
                            className="text-zinc-400"
                        >
                            Cancel
                        </Button>
                    ) : null}
                    <Button
                        onClick={onCreate}
                        disabled={!ctaEnabled}
                        className="bg-indigo-600 hover:bg-indigo-700 px-8"
                    >
                        {isCreating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {busyLabel}
                            </>
                        ) : (
                            createLabel
                        )}
                    </Button>
                </div>
                {footerNote ? (
                    <p className="mt-3 text-right text-xs text-zinc-500">{footerNote}</p>
                ) : null}
            </main>
        </div>
    );
}
