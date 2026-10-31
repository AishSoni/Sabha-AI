"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    useDemoWorkspace,
    type WorkspaceSample,
} from "@/features/demo-workspace";
import { DocumentPanelView } from "../presentation/document-panel";
import { SamplePicker } from "../presentation/sample-picker";
import { StackEditorView } from "../presentation/stack-editor";
import { DemoKnowledgeGate } from "./demo-knowledge-gate";
import { stackParticipants } from "./stack-state";
import { useLocalDocuments } from "./use-local-documents";
import { useLocalStacks } from "./use-local-stacks";

export interface DemoStackDetailProps {
    stackId: string;
    renderPreviewAction?: (sample: WorkspaceSample) => ReactNode;
}

export function DemoStackDetail({
    stackId,
    renderPreviewAction,
}: DemoStackDetailProps) {
    return (
        <DemoKnowledgeGate>
            <Content stackId={stackId} renderPreviewAction={renderPreviewAction} />
        </DemoKnowledgeGate>
    );
}

function Content({ stackId, renderPreviewAction }: DemoStackDetailProps) {
    const workspace = useDemoWorkspace();
    const stacks = useLocalStacks();
    const [pickerOpen, setPickerOpen] = useState(false);
    const stack = stacks.getStack(stackId);
    const participants = useMemo(
        () => stackParticipants(workspace.local, stackId),
        [stackId, workspace.local]
    );
    const documents = useLocalDocuments(
        { kind: "stack", id: stackId },
        {
            audienceLabel: audienceLabel(participants),
        }
    );

    if (!stack) {
        return (
            <main className="mx-auto max-w-3xl px-4 py-16">
                <h1 className="text-xl font-semibold text-white">
                    This practice stack is not available
                </h1>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                    It may have been deleted or replaced by a demo reset. The
                    recorded meeting and its evidence are unchanged.
                </p>
                <Link
                    href="/demo/knowledge-stacks"
                    className="mt-6 inline-flex rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                >
                    Back to practice stacks
                </Link>
            </main>
        );
    }

    const eligibleSamples = documents.samples.filter((sample) =>
        sample.destinationKinds.includes("stack")
    );
    const audience = audienceLabel(participants);

    return (
        <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
            <Link
                href="/demo/knowledge-stacks"
                className="text-sm text-cyan-400 hover:text-cyan-300"
            >
                ← Back to practice stacks
            </Link>

            <div>
                <h1 className="text-xl font-bold text-white">{stack.name}</h1>
                <p className="mt-1 max-w-3xl text-sm text-zinc-400">
                    {stack.description || "No description"} ·{" "}
                    {documents.counts.total} document
                    {documents.counts.total === 1 ? "" : "s"} ·{" "}
                    {documents.counts.ready} ready
                </p>
            </div>

            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                Practice only: documents here never upload to the operator
                workspace, and removing one does not redact the recorded
                meeting or its immutable Files view.
            </div>

            <DocumentPanelView
                scopeLabel="stack"
                title="Practice documents"
                description="Prepared samples move through queued and indexing states before becoming eligible. Stack contents stay current for participants already bound to this stack."
                documents={documents.documents}
                isLoading={documents.isLoading}
                isError={documents.isError}
                uploading={documents.uploading}
                localError={documents.localError}
                deletingId={documents.removingId}
                onRetry={documents.retryDocument}
                onDelete={(document) => {
                    const confirmed = window.confirm(
                        `Remove "${document.file_name}" from this practice stack? It will stop being eligible immediately. The recorded meeting and its documents are unchanged.`
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
                emptyMessage="No practice documents yet. Add an approved sample to watch eligibility change."
            />

            <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                    <CardTitle className="text-white">
                        Who can retrieve this?
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-zinc-400">
                    <p>
                        Eligibility requires a document revision that is ready
                        and not removed. A practice participant can retrieve it
                        only when this stack is one of that participant&apos;s
                        saved stack bindings.
                    </p>
                    <ParticipantList
                        label="Saved practice participants"
                        names={participants.savedParticipants}
                        empty="No saved participant references this stack yet."
                    />
                    <ParticipantList
                        label="Template defaults for future snapshots"
                        names={participants.templateDefaults}
                        empty="No persona template currently defaults to this stack."
                    />
                    <p className="text-xs leading-5 text-zinc-500">
                        Template defaults do not rebind participants captured
                        earlier. Another participant&apos;s unassigned stack,
                        another meeting&apos;s shared documents, and every
                        persona-owned document are excluded.
                    </p>
                    <div>
                        <h3 className="font-medium text-zinc-200">
                            Document-to-participant view
                        </h3>
                        {documents.documents.length === 0 ? (
                            <p className="mt-1 text-sm text-zinc-500">
                                No document is staged in this stack.
                            </p>
                        ) : (
                            <ul className="mt-2 space-y-1.5">
                                {documents.documents.map((document) => (
                                    <li key={document.id}>
                                        <span className="break-all text-zinc-300">
                                            {document.file_name}
                                        </span>
                                        {" — "}
                                        {document.status === "ready"
                                            ? readyAccessLabel(participants)
                                            : notEligibleLabel(document.status)}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </CardContent>
            </Card>

            <StackEditorView
                key={stack.id}
                editing
                initialName={stack.name}
                initialDescription={stack.description ?? ""}
                saving={stacks.pending}
                error={stacks.error}
                title="Edit this practice stack"
                description="Renaming the stack does not rewrite recorded participants. Contents stay current for practice participants already assigned to it."
                onSubmit={async (input) => {
                    const result = await stacks.updateStack(stack.id, input);
                    if (!result.ok) throw new Error(result.error);
                }}
            />

            <SamplePicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                samples={eligibleSamples}
                destinationLabel={`Practice stack: ${stack.name}`}
                audienceLabel={audience}
                isAlreadyAdded={(sample) => documents.isAlreadyAdded(sample)}
                onConfirm={(sample) => documents.addSample(sample)}
                renderPreviewAction={renderPreviewAction}
            />
        </main>
    );
}

function ParticipantList({
    label,
    names,
    empty,
}: {
    label: string;
    names: string[];
    empty: string;
}) {
    return (
        <div>
            <h3 className="font-medium text-zinc-200">{label}</h3>
            <p className="mt-1 text-sm text-zinc-400">
                {names.length > 0 ? names.join(", ") : empty}
            </p>
        </div>
    );
}

function audienceLabel(participants: {
    templateDefaults: string[];
    savedParticipants: string[];
}): string {
    const saved =
        participants.savedParticipants.length > 0
            ? `Saved practice participants: ${participants.savedParticipants.join(", ")}.`
            : "No saved practice participant references this stack yet.";
    const defaults =
        participants.templateDefaults.length > 0
            ? `Future snapshots default to: ${participants.templateDefaults.join(", ")}.`
            : "No persona template defaults to this stack.";
    return `${saved} ${defaults}`;
}

function readyAccessLabel(participants: {
    templateDefaults: string[];
    savedParticipants: string[];
}): string {
    if (participants.savedParticipants.length > 0) {
        return `ready and retrievable by ${participants.savedParticipants.join(", ")}.`;
    }
    if (participants.templateDefaults.length > 0) {
        return `ready; no saved participant yet. A new snapshot from ${participants.templateDefaults.join(", ")} would include it.`;
    }
    return "ready, but no participant is currently bound to this stack.";
}

function notEligibleLabel(status: string): string {
    if (status === "failed") return "not eligible because processing failed. Retry it before expecting retrieval.";
    if (status === "pending" || status === "processing") {
        return "not eligible until the prepared simulation reports Ready.";
    }
    return "not eligible in this practice view.";
}
