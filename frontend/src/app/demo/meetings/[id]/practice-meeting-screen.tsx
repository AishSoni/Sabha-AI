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
            <main className="mx-auto max-w-3xl px-4 py-16">
                <h1 className="text-xl font-semibold text-white">
                    This practice setup is not available
                </h1>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                    It may have been discarded or replaced by a demo reset. The
                    recorded meeting and its evidence are unchanged.
                </p>
                <Link
                    href="/demo/meetings"
                    className="mt-6 inline-flex rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
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
        <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
            <Link
                href="/demo/meetings"
                className="inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to meetings
            </Link>

            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge className="bg-amber-700 text-white hover:bg-amber-700">
                            Practice setup
                        </Badge>
                        <span className="text-xs text-zinc-500">
                            Browser memory only · no responses generated
                        </span>
                    </div>
                    <h1 className="text-xl font-bold text-white">
                        {meeting.name}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                        {meeting.agenda || "No additional context"}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-300 hover:text-red-200"
                    onClick={() => {
                        const confirmed = window.confirm(
                            `Discard "${meeting.name}"? Its local documents and simulated operations will be revoked immediately. The recorded meeting, transcript, citations, and Files view are unchanged.`
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

            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                This setup is a captured practice snapshot. Editing the agenda,
                personas, or stacks after creation does not generate new
                responses. The recorded HDFC transcript and citations remain
                the only historical answers.
                {" "}
                <Link
                    href={originalRecordingHref}
                    className="underline underline-offset-2"
                >
                    Open original HDFC recording
                </Link>
            </div>

            <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                        <Users className="h-4 w-4 text-indigo-400" />
                        Captured participants
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                    {meeting.participants.map((participant) => (
                        <div
                            key={participant.participantId}
                            className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{
                                        backgroundColor: participant.color,
                                    }}
                                />
                                <span className="text-sm font-medium text-white">
                                    {participant.name}
                                </span>
                                <Badge variant="secondary">
                                    Prompt v{participant.sourceRevisionNumber}
                                </Badge>
                            </div>
                            <p className="mt-1 text-xs text-zinc-500">
                                {participant.role}
                            </p>
                            <p className="mt-2 text-xs leading-5 text-zinc-400">
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
                                <summary className="cursor-pointer text-xs text-cyan-400">
                                    Show captured prompt
                                </summary>
                                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-950 p-2 text-xs text-zinc-400">
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
                description="Approved samples are shared with every captured participant. They become eligible only after the prepared simulation reports Ready. No bytes are uploaded to the operator workspace."
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

            <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                        <ShieldAlert className="h-4 w-4 text-amber-400" />
                        What this setup does not do
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm leading-6 text-zinc-400">
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
