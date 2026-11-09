"use client";

/**
 * Browser-memory practice meeting room (spec-25).
 *
 * It shows the captured setup once: participants, their composed prompts and
 * stack bindings, and the local shared-document operations. It deliberately has
 * no turn control, vote, closing, summary, or transcript fabrication.
 */
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FilePlus2, ShieldAlert, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ParticipantMark } from "@/components/identity/participant-mark";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { useDemoWorkspace } from "@/features/demo-workspace";
import type { WorkspaceSample } from "@/features/demo-workspace";
import { DocumentPanelView } from "@/features/knowledge/presentation";
import {
    RecordedExamplesView,
    type RecordedExampleView,
} from "@/features/knowledge/presentation";
import { SamplePicker } from "@/features/knowledge/presentation";
import {
    useLocalDocuments,
    useLocalPracticeMeetings,
} from "@/features/knowledge/local";

export interface PracticeMeetingScreenProps {
    meetingId: string;
    originalRecordingHref: string;
    recordedExamples?: RecordedExampleView[];
    renderPreviewAction?: (sample: WorkspaceSample) => ReactNode;
    renderRecordedPreviewAction?: (example: RecordedExampleView) => ReactNode;
}

export function PracticeMeetingScreen({
    meetingId,
    originalRecordingHref,
    recordedExamples,
    renderPreviewAction,
    renderRecordedPreviewAction,
}: PracticeMeetingScreenProps) {
    const workspace = useDemoWorkspace();
    const practice = useLocalPracticeMeetings();
    const router = useRouter();
    const meeting = practice.getMeeting(meetingId);
    const [pickerOpen, setPickerOpen] = useState(false);
    const documents = useLocalDocuments(
        { kind: "meeting", id: meetingId },
        {
            audienceLabel:
                "Every participant captured in this setup can retrieve a ready shared document. Other practice meetings and every persona-owned document are excluded.",
        }
    );
    const stackLabels = useMemo(
        () =>
            new Map(
                workspace.local.stacks.map((stack) => [
                    stack.stackId,
                    stack.label,
                ])
            ),
        [workspace.local.stacks]
    );
    const visibleSampleIds = useMemo(
        () => new Set(meeting?.sampleIds ?? []),
        [meeting?.sampleIds]
    );
    const examples = (recordedExamples ?? []).filter((example) =>
        visibleSampleIds.has(example.sampleId)
    );

    if (!meeting) {
        return (
            <main id="main-content" className="mx-auto max-w-3xl px-4 py-16" tabIndex={-1}>
                <h1 className="type-page-title text-ink">
                    This practice setup is not available
                </h1>
                <p className="mt-3 type-body text-ink-secondary">
                    It may have been discarded or replaced by a demo reset. The
                    recorded meeting and its evidence are unchanged.
                </p>
                <Link
                    href="/demo/meetings"
                    className="m-control mt-6 inline-flex rounded-control border border-control bg-surface px-4 py-2 type-control text-ink hover:bg-surface-raised"
                >
                    Back to meetings
                </Link>
            </main>
        );
    }

    const samples =
        workspace.seed?.samples.filter((sample) =>
            sample.destinationKinds.includes("meeting")
        ) ?? [];

    return (
        <main id="main-content" className="mx-auto max-w-5xl space-y-5 px-4 py-8" tabIndex={-1}>
            <Link
                href="/demo/meetings"
                className="m-control inline-flex items-center gap-1 type-control text-action hover:text-action-hover"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to meetings
            </Link>

            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge
                            variant="outline"
                            className="border-warning/40 bg-warning-soft text-warning"
                        >
                            Practice setup
                        </Badge>
                        <span className="text-xs text-ink-muted">
                            Practice only · browser memory
                        </span>
                    </div>
                    <h1 className="text-xl font-bold text-ink">
                        {meeting.name}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
                        {meeting.agenda || "No additional context"}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:text-danger-hover"
                    onClick={() => {
                        const confirmed = window.confirm(
                            `Discard "${meeting.name}"? This practice setup will be removed from this browser.`
                        );
                        if (confirmed) {
                            practice.discardMeeting(meeting.meetingId);
                            router.push("/demo/meetings");
                        }
                    }}
                >
                    Discard practice setup
                </Button>
            </div>

            <div className="rounded-group border border-warning/40 bg-warning-soft px-3 py-2 type-body text-warning">
                Practice only · changes stay in this browser and never alter the
                recording.{" "}
                <Link
                    href={originalRecordingHref}
                    className="underline underline-offset-2"
                >
                    Open original HDFC recording
                </Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-ink">
                        <Users className="h-4 w-4 text-action" />
                        Captured participants
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                    {meeting.participants.map((participant) => (
                        <div
                            key={participant.participantId}
                            className="rounded-control border border-separator bg-surface-raised/40 p-3"
                        >
                            <div className="flex items-center gap-2">
                                <ParticipantMark
                                    participant={{
                                        id: participant.participantId,
                                        persona_id: participant.personaId,
                                        name: participant.name,
                                        color: participant.color,
                                    }}
                                    size="sm"
                                />
                                <span className="text-sm font-medium text-ink">
                                    {participant.name}
                                </span>
                                <Badge variant="secondary">
                                    Prompt v{participant.sourceRevisionNumber}
                                </Badge>
                            </div>
                            <p className="mt-1 type-meta text-ink-muted">
                                {participant.role}
                            </p>
                            <p className="mt-2 type-meta text-ink-secondary">
                                Saved stacks:{" "}
                                {participant.stackIds.length > 0
                                    ? participant.stackIds
                                          .map(
                                              (stackId) =>
                                                  stackLabels.get(stackId) ??
                                                  `${stackId} (unavailable)`
                                          )
                                          .join(", ")
                                    : "None"}
                            </p>
                            <details className="mt-2">
                                <summary className="cursor-pointer type-meta text-action">
                                    Show captured prompt
                                </summary>
                                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-control bg-surface-raised p-2 type-meta text-ink-secondary">
                                    {participant.composedPrompt}
                                </pre>
                            </details>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <DocumentPanelView
                scopeLabel="meeting"
                title="Shared documents in this practice setup"
                description="Shared with every captured participant once ready."
                documents={documents.documents}
                isLoading={documents.isLoading}
                isError={documents.isError}
                uploading={documents.uploading}
                localError={documents.localError}
                deletingId={documents.removingId}
                onRetry={documents.retryDocument}
                onDelete={(document) => {
                    const confirmed = window.confirm(
                        `Remove "${document.file_name}" from this practice setup? It will stop being eligible immediately. The recorded meeting and its documents are unchanged.`
                    );
                    if (confirmed) documents.removeDocument(document);
                }}
                renderPreviewAction={(document) => {
                    if (document.status !== "ready") return null;
                    const sample = documents.sampleForDocument(document);
                    if (!sample || sample.previewMode !== "inline") return null;
                    return renderPreviewAction?.(sample) ?? null;
                }}
                uploadAction={
                    <Button
                        type="button"
                        size="sm"
                        disabled={documents.uploading}
                        onClick={() => setPickerOpen(true)}
                    >
                        <FilePlus2 className="mr-1 h-4 w-4" />
                        Add sample
                    </Button>
                }
                emptyMessage="No shared practice documents in this setup yet. Add an approved sample to watch simulated ingestion."
            />

            <RecordedExamplesView
                examples={examples}
                renderPreviewAction={renderRecordedPreviewAction}
            />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-ink">
                        <ShieldAlert className="h-4 w-4 text-warning" />
                        What this setup does not do
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 type-body text-ink-secondary">
                    <p>
                        It does not send a turn, generate a reply, conduct a
                        vote, start a closing, or produce a summary. Those
                        controls are intentionally absent for custom setups.
                    </p>
                    <p>
                        Discarding revokes this setup&apos;s local document
                        eligibility. It never deletes public package bytes or
                        edits the recorded Files view.
                    </p>
                </CardContent>
            </Card>

            <SamplePicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                samples={samples}
                destinationLabel={`Practice meeting: ${meeting.name}`}
                audienceLabel="Every participant captured in this setup can retrieve a ready shared document."
                isAlreadyAdded={(sample) => documents.isAlreadyAdded(sample)}
                onConfirm={(sample) => documents.addSample(sample)}
                renderPreviewAction={renderPreviewAction}
            />
        </main>
    );
}
