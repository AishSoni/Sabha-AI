"use client";

/**
 * Local creation adapter for practice meetings (spec-25).
 *
 * Sample selection is only a staged reference. Bytes are verified through the
 * bounded public package loader, then a single workspace commit creates the
 * meeting and its pending document operations. No live HTTP command runs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    useDemoWorkspace,
    type LocalPracticeMeeting,
    type WorkspaceSample,
} from "@/features/demo-workspace";
import { SampleSourceError, verifySampleSource } from "./sample-source";
import {
    createLocalPracticeMeeting,
    discardLocalPracticeMeeting,
    findLocalPracticeMeeting,
    type PracticeMeetingFailure,
} from "./practice-meeting-state";

export interface CreateLocalPracticeMeetingInput {
    name: string;
    agenda: string;
    personaIds: string[];
}

export interface LocalPracticeMeetingsAdapter {
    meetings: LocalPracticeMeeting[];
    stagedSamples: WorkspaceSample[];
    isCreating: boolean;
    verifyingSample: boolean;
    error: string | null;
    stagedError: string | null;
    stageSample: (
        sample: WorkspaceSample
    ) => Promise<{ ok: true } | { ok: false; error: string }>;
    unstageSample: (sampleId: string) => void;
    createMeeting: (
        input: CreateLocalPracticeMeetingInput
    ) => Promise<
        | { ok: true; meeting: LocalPracticeMeeting }
        | { ok: false; error: string }
    >;
    discardMeeting: (meetingId: string) => void;
    getMeeting: (meetingId: string) => LocalPracticeMeeting | undefined;
    /** Clears the retained submission so the visitor can start another setup. */
    resetCreation: () => void;
}

export interface UseLocalPracticeMeetingsOptions {
    verifySample?: typeof verifySampleSource;
    idFactory?: (prefix: string) => string;
    now?: () => Date;
}

function localId(prefix: string): string {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
        return `${prefix}-${cryptoApi.randomUUID()}`;
    }
    return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function failureMessage(reason: PracticeMeetingFailure): string {
    switch (reason) {
        case "base_instructions_unavailable":
            return "The approved base instructions are unavailable for this recording.";
        case "limit_reached":
            return "This practice workspace reached a setup or document limit.";
        case "concurrent_limit":
            return "Two prepared documents are already processing. Wait for one to finish.";
        case "sample_unavailable":
            return "A staged sample is no longer available in this workspace.";
        case "destination_not_allowed":
            return "A staged sample cannot be attached to a meeting.";
        case "duplicate_sample":
            return "A staged sample is already present in this setup.";
        case "not_found":
            return "This practice setup is no longer available.";
        default:
            return "The practice setup could not be created.";
    }
}

export function useLocalPracticeMeetings(
    options: UseLocalPracticeMeetingsOptions = {}
): LocalPracticeMeetingsAdapter {
    const workspace = useDemoWorkspace();
    const verifySample = options.verifySample ?? verifySampleSource;
    const idFactory = options.idFactory ?? localId;
    const now = useMemo(() => options.now ?? (() => new Date()), [options.now]);

    const [stagedSamples, setStagedSamples] = useState<WorkspaceSample[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [verifyingSample, setVerifyingSample] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stagedError, setStagedError] = useState<string | null>(null);
    const workInFlight = useRef(false);
    const retainedMeetingId = useRef<string | null>(null);
    const epochRef = useRef(workspace.workspaceEpoch);

    useEffect(() => {
        if (epochRef.current === workspace.workspaceEpoch) return;
        epochRef.current = workspace.workspaceEpoch;
        setStagedSamples([]);
        setError(null);
        setStagedError(null);
        retainedMeetingId.current = null;
        workInFlight.current = false;
        setIsCreating(false);
        setVerifyingSample(false);
    }, [workspace.workspaceEpoch]);

    const stageSample = useCallback(
        async (
            sample: WorkspaceSample
        ): Promise<{ ok: true } | { ok: false; error: string }> => {
            setStagedError(null);
            setError(null);
            if (!workspace.expanded) {
                const message =
                    "Practice samples are unavailable because this workspace cannot expand.";
                setStagedError(message);
                return { ok: false, error: message };
            }
            const current = workspace.seed?.samples.find(
                (candidate) => candidate.sampleId === sample.sampleId
            );
            if (!current) {
                const message =
                    "The prepared sample is not available in this workspace.";
                setStagedError(message);
                return { ok: false, error: message };
            }
            if (!current.destinationKinds.includes("meeting")) {
                const message =
                    "This prepared sample cannot be attached to a meeting.";
                setStagedError(message);
                return { ok: false, error: message };
            }
            if (
                stagedSamples.some(
                    (candidate) => candidate.sampleId === current.sampleId
                )
            ) {
                const message =
                    "This sample is already staged for the practice setup.";
                setStagedError(message);
                return { ok: false, error: message };
            }
            if (stagedSamples.length >= workspace.limits.concurrentDocumentOps) {
                const message = `Stage at most ${workspace.limits.concurrentDocumentOps} prepared samples at once.`;
                setStagedError(message);
                return { ok: false, error: message };
            }
            const asset = workspace.publishedAssets.find(
                (candidate) => candidate.assetId === current.assetId
            );
            const epoch = workspace.workspaceEpoch;
            setVerifyingSample(true);
            try {
                await verifySample(current, asset);
            } catch (cause) {
                const message =
                    cause instanceof SampleSourceError
                        ? cause.message
                        : "The prepared sample could not be verified.";
                if (workspace.isCurrentEpoch(epoch)) {
                    setStagedError(message);
                }
                setVerifyingSample(false);
                return { ok: false, error: message };
            }
            setVerifyingSample(false);
            if (!workspace.isCurrentEpoch(epoch)) {
                return {
                    ok: false,
                    error:
                        "This workspace was reset; the prepared sample was not staged.",
                };
            }
            setStagedSamples((previous) => {
                if (
                    previous.some(
                        (candidate) => candidate.sampleId === current.sampleId
                    ) ||
                    previous.length >= workspace.limits.concurrentDocumentOps
                ) {
                    return previous;
                }
                return [...previous, current];
            });
            return { ok: true };
        },
        [stagedSamples, workspace, verifySample]
    );

    const unstageSample = useCallback((sampleId: string) => {
        setStagedSamples((previous) =>
            previous.filter((sample) => sample.sampleId !== sampleId)
        );
        setStagedError(null);
    }, []);

    const createMeeting = useCallback(
        async (
            input: CreateLocalPracticeMeetingInput
        ): Promise<
            | { ok: true; meeting: LocalPracticeMeeting }
            | { ok: false; error: string }
        > => {
            if (workInFlight.current) {
                const existing = retainedMeetingId.current
                    ? findLocalPracticeMeeting(
                          workspace.getLocal(),
                          retainedMeetingId.current
                      )
                    : undefined;
                return existing
                    ? { ok: true, meeting: existing }
                    : {
                          ok: false,
                          error: "The practice setup is already being created.",
                      };
            }
            const retainedId = retainedMeetingId.current;
            if (retainedId) {
                const existing = findLocalPracticeMeeting(
                    workspace.getLocal(),
                    retainedId
                );
                if (existing) return { ok: true, meeting: existing };
            }

            workInFlight.current = true;
            setIsCreating(true);
            setError(null);
            const epoch = workspace.workspaceEpoch;
            try {
                const samples = workspace.seed?.samples ?? [];
                const currentSamples = stagedSamples
                    .map((sample) =>
                        samples.find(
                            (candidate) => candidate.sampleId === sample.sampleId
                        )
                    )
                    .filter(
                        (sample): sample is WorkspaceSample => sample !== undefined
                    );
                if (currentSamples.length !== stagedSamples.length) {
                    const message =
                        "A staged sample is no longer available. Select it again.";
                    setError(message);
                    return { ok: false, error: message };
                }

                let createdMeeting: LocalPracticeMeeting | undefined;
                let failure: string | null = null;
                const outcome = workspace.commitLocal((current) => {
                    const result = createLocalPracticeMeeting(
                        current,
                        {
                            name: input.name,
                            agenda: input.agenda,
                            personaIds: input.personaIds,
                            sampleIds: currentSamples.map(
                                (sample) => sample.sampleId
                            ),
                        },
                        samples,
                        workspace.seed?.baseInstructions ?? null,
                        { idFactory, clock: () => now().toISOString() }
                    );
                    if (!result.ok) {
                        failure = failureMessage(result.reason);
                        return current;
                    }
                    createdMeeting = result.value.meeting;
                    return result.state;
                });
                if (!outcome.ok) {
                    setError(outcome.message);
                    return { ok: false, error: outcome.message };
                }
                if (!workspace.isCurrentEpoch(epoch)) {
                    const message =
                        "This workspace was reset; the practice setup was not created.";
                    setError(message);
                    return { ok: false, error: message };
                }
                if (failure) {
                    setError(failure);
                    return { ok: false, error: failure };
                }
                if (!createdMeeting) {
                    const message = "The practice setup was not created.";
                    setError(message);
                    return { ok: false, error: message };
                }
                retainedMeetingId.current = createdMeeting.meetingId;
                setStagedSamples([]);
                return { ok: true, meeting: createdMeeting };
            } finally {
                workInFlight.current = false;
                setIsCreating(false);
            }
        },
        [workspace, stagedSamples, idFactory, now]
    );

    const discardMeeting = useCallback(
        (meetingId: string) => {
            setError(null);
            if (retainedMeetingId.current === meetingId) {
                retainedMeetingId.current = null;
            }
            workspace.commitLocal((current) =>
                discardLocalPracticeMeeting(current, meetingId)
            );
        },
        [workspace]
    );

    const getMeeting = useCallback(
        (meetingId: string) =>
            findLocalPracticeMeeting(workspace.local, meetingId),
        [workspace.local]
    );

    const resetCreation = useCallback(() => {
        retainedMeetingId.current = null;
        setStagedSamples([]);
        setError(null);
        setStagedError(null);
    }, []);

    return {
        meetings: workspace.local.practiceMeetings,
        stagedSamples,
        isCreating,
        verifyingSample,
        error,
        stagedError,
        stageSample,
        unstageSample,
        createMeeting,
        discardMeeting,
        getMeeting,
        resetCreation,
    };
}
