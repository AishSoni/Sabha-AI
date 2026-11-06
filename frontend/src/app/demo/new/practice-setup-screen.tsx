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
import { useRouter } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDemoWorkspace } from "@/features/demo-workspace";
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
    const router = useRouter();
    const workspace = useDemoWorkspace();
    const practice = useLocalPracticeMeetings();
    const [agenda, setAgenda] = useState(initialAgenda);
    const [context, setContext] = useState(initialContext);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(workspace.local.personas.map((persona) => persona.personaId))
    );
    const [pickerOpen, setPickerOpen] = useState(false);
    const [navigationError, setNavigationError] = useState<string | null>(null);

    if (!workspace.expanded) {
        return (
            <main id="main-content" className="mx-auto max-w-3xl px-4 py-12" tabIndex={-1}>
                <Card className="p-6">
                    <h1 className="type-item-title text-ink">
                        Practice editing is unavailable
                    </h1>
                    <p className="mt-2 type-body text-ink-secondary">
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
                    <div className="rounded-group border-2 border-dashed border-control bg-surface/30 p-6 text-center">
                        <FilePlus2 className="mx-auto mb-2 h-8 w-8 text-ink-muted" />
                        <p className="type-body text-ink-secondary">
                            Choose an approved practice sample
                        </p>
                        <p className="mt-1 type-meta text-ink-muted">
                            Choose an approved sample from this recording.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            busy={practice.verifyingSample}
                            busyLabel="Verifying sample"
                            className="mt-3"
                            onClick={() => setPickerOpen(true)}
                        >
                            <FilePlus2 className="h-4 w-4" />
                            Add approved sample
                        </Button>
                        {practice.stagedError ? (
                            <p
                                className="mt-3 text-xs text-danger"
                                role="alert"
                            >
                                {practice.stagedError}
                            </p>
                        ) : null}
                    </div>
                }
                isCreating={practice.isCreating}
                creationError={practice.error ?? navigationError}
                navigationDone={false}
                canCreate={canCreate}
                onCreate={() => {
                    setNavigationError(null);
                    void practice
                        .createMeeting({
                            name: agenda,
                            agenda: context,
                            personaIds: Array.from(selectedIds),
                        })
                        .then((result) => {
                            if (!result.ok) return;
                            try {
                                router.push(
                                    `/demo/meetings/${result.meeting.meetingId}`
                                );
                            } catch {
                                setNavigationError(
                                    "The practice setup was saved but could not be opened. Open it from Meetings and try again."
                                );
                            }
                        });
                }}
                onCancel={onExit}
                title="Practice setup"
                description="Saved in this browser; the recorded meeting is unchanged."
                backHref="/demo"
                createLabel="Create practice setup"
                busyLabel="Creating practice setup..."
                disclosure={
                    <div className="mb-4 rounded-group border border-warning/40 bg-warning-soft px-3 py-2 type-body text-warning">
                        Practice only · changes stay in this browser and never
                        alter the recording.{" "}
                        <Link
                            href={recordedCreated ? originalRecordingHref : "/demo"}
                            className="underline underline-offset-2"
                        >
                            Open original HDFC recording
                        </Link>
                    </div>
                }
            />

            <SamplePicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                samples={samples}
                destinationLabel="Shared documents in the practice setup"
                audienceLabel="Every participant in this setup can retrieve a shared document once it is ready."
                isAlreadyAdded={(sample) => stagedIds.has(sample.sampleId)}
                onConfirm={(sample) => practice.stageSample(sample)}
                renderPreviewAction={renderPreviewAction}
            />
        </>
    );
}
