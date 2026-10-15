'use client';

import { useState } from 'react';
import { useMeetingStore } from '@/stores/meetingStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Bot, RefreshCw, AlertTriangle } from 'lucide-react';
import { ApiError, participantsApi, type AIParticipant } from '@/lib/api';

export function RosterTab() {
    const { currentMeeting } = useMeetingStore();

    if (!currentMeeting) {
        return (
            <div className="flex items-center justify-center h-full text-zinc-500">
                No meeting selected
            </div>
        );
    }

    return (
        <ScrollArea className="h-full p-4">
            <div className="max-w-3xl mx-auto space-y-4">
                <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-1">AI Roster</h3>
                    <p className="text-sm text-zinc-400">
                        View the AI participants in this meeting. Each AI has their own personality, system prompt, and private knowledge stack.
                    </p>
                </div>

                {currentMeeting.participants.length === 0 ? (
                    <div className="text-center py-16 text-zinc-500">
                        <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <h3 className="text-lg font-medium text-zinc-400 mb-1">No Participants</h3>
                        <p className="text-sm">This meeting has no AI participants.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {currentMeeting.participants.map((participant) => (
                            <ParticipantDetailCard
                                key={participant.id}
                                participant={participant}
                            />
                        ))}
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}

interface ParticipantDetailCardProps {
    participant: AIParticipant;
}

function ParticipantDetailCard({ participant }: ParticipantDetailCardProps) {
    const [isPromptOpen, setIsPromptOpen] = useState(false);
    const [isRefreshOpen, setIsRefreshOpen] = useState(false);
    const [preview, setPreview] = useState<Record<string, { from: unknown; to: unknown }> | null>(null);
    const [previewUnchanged, setPreviewUnchanged] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [applying, setApplying] = useState(false);
    const [applyError, setApplyError] = useState<string | null>(null);
    const [applied, setApplied] = useState(false);
    const loadMeeting = useMeetingStore((s) => s.loadMeeting);
    const currentMeetingId = useMeetingStore((s) => s.currentMeeting?.id);

    const handlePreview = async () => {
        setPreviewLoading(true);
        setPreviewError(null);
        setApplyError(null);
        setApplied(false);
        try {
            const result = await participantsApi.refreshPreview(participant.id);
            setPreview(result.diff ?? {});
            setPreviewUnchanged(!result.changed);
        } catch (err) {
            setPreview(null);
            setPreviewError(err instanceof ApiError ? `${err.code}: ${err.message}` : (err as Error).message);
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleApply = async () => {
        setApplying(true);
        setApplyError(null);
        setApplied(false);
        try {
            await participantsApi.refreshParticipant(participant.id);
            setApplied(true);
            setPreview(null);
            if (currentMeetingId) await loadMeeting(currentMeetingId);
        } catch (err) {
            const message = err instanceof ApiError ? `${err.code}: ${err.message}` : (err as Error).message;
            // Stale or busy conflicts carry a safe server message; the preview is
            // discarded so the next preview reloads fresh revisions.
            setPreview(null);
            setApplyError(message);
        } finally {
            setApplying(false);
        }
    };

    return (
        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
            {/* Header */}
            <div className="p-4 flex items-start gap-4">
                <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                    style={{ backgroundColor: participant.color }}
                >
                    {participant.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-white">{participant.name}</h4>
                        <Badge
                            variant="secondary"
                            className="text-xs capitalize"
                            style={{
                                backgroundColor: participant.color + '20',
                                color: participant.color,
                            }}
                        >
                            {participant.role}
                        </Badge>
                    </div>
                    <p className="text-xs text-zinc-500">
                        Model: {participant.provider_config?.model || 'Default'}
                    </p>
                </div>
            </div>

            {/* System Prompt Section */}
            <Collapsible open={isPromptOpen} onOpenChange={setIsPromptOpen}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="w-full justify-between px-4 py-2 h-auto text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-none border-t border-zinc-800"
                    >
                        <span className="flex items-center gap-2">
                            <Bot className="w-4 h-4" />
                            System Prompt
                        </span>
                        {isPromptOpen ? (
                            <ChevronUp className="w-4 h-4" />
                        ) : (
                            <ChevronDown className="w-4 h-4" />
                        )}
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="px-4 py-3 bg-zinc-950/50 border-t border-zinc-800">
                        <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                            {participant.system_prompt}
                        </pre>
                    </div>
                </CollapsibleContent>
            </Collapsible>

            {/* Persona refresh section: explicit preview diff + apply. */}
            <Collapsible open={isRefreshOpen} onOpenChange={setIsRefreshOpen}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        aria-label={`Persona refresh for ${participant.name}`}
                        className="w-full justify-between px-4 py-2 h-auto text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-none border-t border-zinc-800"
                    >
                        <span className="flex items-center gap-2">
                            <RefreshCw className="w-4 h-4" />
                            Persona Refresh
                        </span>
                        {isRefreshOpen ? (
                            <ChevronUp className="w-4 h-4" />
                        ) : (
                            <ChevronDown className="w-4 h-4" />
                        )}
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="px-4 py-3 bg-zinc-950/50 border-t border-zinc-800 space-y-3">
                        <p className="text-xs text-zinc-500">
                            This participant keeps its snapshotted settings until you review and apply a refresh.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePreview}
                            disabled={previewLoading || applying}
                            aria-label={`Preview refresh for ${participant.name}`}
                            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        >
                            {previewLoading ? 'Loading preview…' : 'Preview changes'}
                        </Button>
                        {previewError && (
                            <p role="alert" className="text-xs text-red-400 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {previewError}
                            </p>
                        )}
                        {preview && (
                            <div className="space-y-2">
                                {previewUnchanged || Object.keys(preview).length === 0 ? (
                                    <p role="status" className="text-xs text-zinc-400">
                                        Already up to date — no changes to apply.
                                    </p>
                                ) : (
                                    <>
                                        <dl className="space-y-1 text-xs">
                                            {Object.entries(preview).map(([field, change]) => (
                                                <div key={field} className="flex flex-col gap-0.5 rounded bg-zinc-900 p-2">
                                                    <dt className="font-medium text-zinc-300">{field}</dt>
                                                    <dd className="text-zinc-500 line-through">
                                                        {JSON.stringify(change.from) ?? '—'}
                                                    </dd>
                                                    <dd className="text-zinc-200">
                                                        {JSON.stringify(change.to) ?? '—'}
                                                    </dd>
                                                </div>
                                            ))}
                                        </dl>
                                        <Button
                                            size="sm"
                                            onClick={handleApply}
                                            disabled={applying}
                                            aria-label={`Apply refresh for ${participant.name}`}
                                            className="bg-indigo-600 hover:bg-indigo-700"
                                        >
                                            {applying ? 'Applying…' : 'Apply refresh'}
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}
                        {applyError && (
                            <p role="alert" className="text-xs text-red-400 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Refresh not applied: {applyError}. Preview again for fresh revisions.
                            </p>
                        )}
                        {applied && (
                            <p role="status" className="text-xs text-green-400">
                                Refresh applied — showing the server-confirmed snapshot.
                            </p>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}
