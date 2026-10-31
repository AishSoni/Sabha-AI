"use client";

/**
 * Inline practice setup editor on the existing guided creation route (spec-25).
 *
 * It reuses the live creation presentation and the approved-sample picker. The
 * only difference from the live form is the injected upload control: no native
 * file input is ever rendered or opened here.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, FilePlus2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDemoWorkspace } from "@/features/demo-workspace";
import type { LocalPracticeMeeting } from "@/features/demo-workspace";
import { MeetingCreationScreen } from "@/features/meetings/presentation/meeting-creation-screen";
import { SamplePicker } from "@/features/knowledge/presentation";
import { useLocalPracticeMeetings } from "@/features/knowledge/local";
import type { WorkspaceSample } from "@/features/demo-workspace";

export interface PracticeSetupScreenProps {
    initialAgenda: string;
    initialContext: string;
    recordedCreated: boolean;
    originalRecordingHref: string;
    onExit: () => void;
    renderPreviewAction?: (sample: WorkspaceSample) => ReactNode;
}

export function PracticeSetupScreen({
    initialAgenda,
    initialContext,
    recordedCreated,
    originalRecordingHref,
    onExit,
    renderPreviewAction,
}: PracticeSetupScreenProps) {
    const workspace = useDemoWorkspace();
    const practice = useLocalPracticeMeetings();
    const [agenda, setAgenda] = useState(initialAgenda);
    const [context, setContext] = useState(initialContext);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(workspace.local.personas.map((persona) => persona.personaId))
    );
    const [pickerOpen, setPickerOpen] = useState(false);
    const [created, setCreated] = useState<LocalPracticeMeeting | null>(null);

    if (!workspace.expanded) {
        return (
            <main className="mx-auto max-w-3xl px-4 py-12">
                <Card className="border-zinc-800 bg-zinc-900/50 p-6">
                    <h1 className="text-lg font-semibold text-white">
                        Practice editing is unavailable
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                        {workspace.error ??
                            "This recording does not include a usable practice workspace seed."}
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        className="mt-5"
                        onClick={onExit}
                    >
                        Back to the recorded intake
                    </Button>
                </Card>
            </main>
        );
    }

    if (created) {
        return (
            <main className="mx-auto max-w-3xl px-4 py-10">
                <Card className="border-emerald-900/60 bg-emerald-950/20 p-6">
                    <div className="flex items-center gap-2 text-emerald-300">
                        <ShieldCheck className="h-5 w-5" />
                        <h1 className="text-lg font-semibold">
                            Practice setup created
                        </h1>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">
                        One browser-memory setup now exists. Any selected
                        prepared samples begin their simulated processing
                        against this local meeting. No real meeting, upload,
                        provider call, or server-backed ingestion was created.
                    </p>
                    <dl className="mt-4 grid gap-2 text-sm text-zinc-400 sm:grid-cols-3">
                        <div>
                            <dt className="text-xs text-zinc-500">
                                Participants
                            </dt>
                            <dd>{created.participants.length}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-zinc-500">
                                Prepared samples
                            </dt>
                            <dd>{created.sampleIds.length}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-zinc-500">Scope</dt>
                            <dd>This browser tab</dd>
                        </div>
                    </dl>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <Link
                            href={`/demo/meetings/${created.meetingId}`}
                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                        >
                            Open practice setup
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link
                            href={originalRecordingHref}
                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                        >
                            Open original HDFC recording
                        </Link>
                    </div>
                    <p className="mt-4 text-xs leading-5 text-zinc-500">
                        This setup does not generate transcript responses. The
                        original recorded HDFC transcript, citations, and Files
                        view are unchanged.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onExit}
                        >
                            Back to recorded intake
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                practice.resetCreation();
                                setCreated(null);
                                setAgenda(initialAgenda);
                                setContext(initialContext);
                                setSelectedIds(
                                    new Set(
                                        workspace.local.personas.map(
                                            (persona) => persona.personaId
                                        )
                                    )
                                );
                            }}
                        >
                            Start another practice setup
                        </Button>
                    </div>
                    {!recordedCreated ? (
                        <p className="mt-3 text-xs text-zinc-500">
                            The original guided recording still starts from the
                            board if it has not been created in this tab.
                        </p>
                    ) : null}
                </Card>
            </main>
        );
    }

    const roster = workspace.local.personas.map((persona) => {
        const activeIndex = persona.revisions.findIndex(
            (revision) => revision.revisionId === persona.activeRevisionId
        );
        return {
            id: persona.personaId,
            name: persona.name,
            subtitle: `${persona.role} · prompt v${
                activeIndex >= 0 ? activeIndex + 1 : persona.revisions.length
            }`,
            color: persona.color,
            selected: selectedIds.has(persona.personaId),
        };
    });
    const samples =
        workspace.seed?.samples.filter((sample) =>
            sample.destinationKinds.includes("meeting")
        ) ?? [];
    const stagedIds = new Set(
        practice.stagedSamples.map((sample) => sample.sampleId)
    );
    const canCreate =
        agenda.trim().length > 0 &&
        selectedIds.size > 0 &&
        !practice.isCreating &&
        !practice.verifyingSample;

    return (
        <>
            <MeetingCreationScreen
                agenda={agenda}
                context={context}
                onAgendaChange={setAgenda}
                onContextChange={setContext}
                roster={roster}
                loadingRoster={false}
                onToggleRoster={(id) => {
                    setSelectedIds((previous) => {
                        const next = new Set(previous);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                    });
                }}
                onSelectAll={() => {
                    const everySelected =
                        roster.length > 0 &&
                        roster.every((persona) => persona.selected);
                    setSelectedIds(
                        everySelected
                            ? new Set()
                            : new Set(roster.map((persona) => persona.id))
                    );
                }}
                rosterNewHref="/demo/roster"
                stagedItems={practice.stagedSamples.map((sample) => ({
                    key: sample.sampleId,
                    label: sample.fileName,
                    status: "pending" as const,
                    statusLabel: "Selected · starts after setup is created",
                    removable: !practice.isCreating,
                }))}
                onRemoveStaged={(index) => {
                    const sample = practice.stagedSamples[index];
                    if (sample) practice.unstageSample(sample.sampleId);
                }}
                uploadControl={
                    <div className="rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/30 p-6 text-center">
                        <FilePlus2 className="mx-auto mb-2 h-8 w-8 text-zinc-500" />
                        <p className="text-sm text-zinc-300">
                            Choose an approved practice sample
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                            The filesystem picker is never opened. Only package
                            samples with an explicit upload approval can be
                            selected, and their public bytes are verified before
                            staging.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3 border-zinc-700 text-zinc-200"
                            disabled={practice.verifyingSample}
                            onClick={() => setPickerOpen(true)}
                        >
                            {practice.verifyingSample ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <FilePlus2 className="mr-2 h-4 w-4" />
                            )}
                            Add approved sample
                        </Button>
                        {practice.stagedError ? (
                            <p
                                className="mt-3 text-xs text-red-300"
                                role="alert"
                            >
                                {practice.stagedError}
                            </p>
                        ) : null}
                    </div>
                }
                isCreating={practice.isCreating}
                creationError={practice.error}
                navigationDone={false}
                canCreate={canCreate}
                onCreate={() => {
                    void practice
                        .createMeeting({
                            name: agenda,
                            agenda: context,
                            personaIds: Array.from(selectedIds),
                        })
                        .then((result) => {
                            if (result.ok) setCreated(result.meeting);
                        });
                }}
                onCancel={onExit}
                title="Practice editing this setup"
                description="Edit a temporary setup without changing the recorded HDFC meeting"
                backHref="/demo"
                createLabel="Create practice meeting"
                busyLabel="Creating practice setup..."
                footerNote="A practice setup is created once. Selected sample bytes are not uploaded; processing is simulated in this browser tab."
                disclosure={
                    <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                        <p>
                            Practice only. Your edits, persona bindings, and
                            approved samples stay in this browser tab. They do
                            not generate responses or change the recorded HDFC
                            transcript, citations, or Files view.
                        </p>
                        <p className="mt-1 text-xs text-amber-200/80">
                            The setup captures each selected persona&apos;s
                            active prompt and current stack bindings once.
                            Later persona edits do not rewrite that snapshot.
                            {" "}
                            {recordedCreated ? (
                                <Link
                                    href={originalRecordingHref}
                                    className="underline underline-offset-2"
                                >
                                    Open original HDFC recording
                                </Link>
                            ) : (
                                <Link
                                    href="/demo"
                                    className="underline underline-offset-2"
                                >
                                    Open original HDFC recording from the board
                                </Link>
                            )}
                        </p>
                    </div>
                }
            />

            <SamplePicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                samples={samples}
                destinationLabel="Shared documents in the practice meeting"
                audienceLabel="Every participant captured in this setup will be able to retrieve a shared document once its prepared simulation reports Ready."
                isAlreadyAdded={(sample) => stagedIds.has(sample.sampleId)}
                onConfirm={(sample) => practice.stageSample(sample)}
                renderPreviewAction={renderPreviewAction}
            />
        </>
    );
}
