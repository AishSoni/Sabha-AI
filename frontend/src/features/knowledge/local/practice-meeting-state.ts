/**
 * Browser-memory practice meeting creation (spec-25).
 *
 * A practice setup captures the active persona prompt, metadata, and stack
 * bindings once. Approved sample references are staged first and become local
 * document operations only when the local meeting identity exists.
 */
import {
    WORKSPACE_LIMITS,
    type LocalPracticeMeeting,
    type LocalPracticeParticipant,
    type WorkspaceDocument,
    type WorkspaceLocalState,
    type WorkspacePersona,
    type WorkspaceRevision,
    type WorkspaceSample,
} from "@/features/demo-workspace";
import {
    addLocalDocument,
    concurrentOperationCount,
    removeLocalDocument,
} from "./document-state";

export type PracticeMeetingFailure =
    | "invalid"
    | "not_found"
    | "limit_reached"
    | "sample_unavailable"
    | "destination_not_allowed"
    | "duplicate_sample"
    | "concurrent_limit"
    | "base_instructions_unavailable";

export type PracticeMeetingResult<T> =
    | { ok: true; state: WorkspaceLocalState; value: T }
    | { ok: false; reason: PracticeMeetingFailure; message: string };

export interface CreatePracticeMeetingInput {
    name: string;
    agenda: string;
    personaIds: string[];
    sampleIds: string[];
}

export interface PracticeMeetingDeps {
    idFactory: (prefix: string) => string;
    clock: () => string;
}

function empty(value: string): boolean {
    return value.trim().length === 0;
}

function localMeetingId(deps: PracticeMeetingDeps): string {
    const candidate = deps.idFactory("local-meeting");
    return candidate.startsWith("local-") ? candidate : `local-${candidate}`;
}

function activeRevision(persona: WorkspacePersona): WorkspaceRevision | null {
    return (
        persona.revisions.find(
            (revision) => revision.revisionId === persona.activeRevisionId
        ) ??
        persona.revisions[persona.revisions.length - 1] ??
        null
    );
}

function participant(
    persona: WorkspacePersona,
    baseInstructions: string,
    deps: PracticeMeetingDeps
): LocalPracticeParticipant | null {
    const active = activeRevision(persona);
    if (!active) return null;
    const number =
        persona.revisions.findIndex(
            (revision) => revision.revisionId === active.revisionId
        ) + 1;
    return {
        participantId: deps.idFactory("practice-participant"),
        personaId: persona.personaId,
        name: persona.name,
        role: persona.role,
        color: persona.color,
        composedPrompt: `${baseInstructions}\n\n${active.prompt}`,
        stackIds: [...persona.stackIds],
        sourceRevisionId: active.revisionId,
        sourceRevisionNumber: number,
    };
}

export function practiceMeetingCount(state: WorkspaceLocalState): number {
    return state.practiceMeetings.length + state.practiceSetups.length;
}

export function createLocalPracticeMeeting(
    state: WorkspaceLocalState,
    input: CreatePracticeMeetingInput,
    samples: readonly WorkspaceSample[],
    baseInstructions: string | null,
    deps: PracticeMeetingDeps
): PracticeMeetingResult<{
    meeting: LocalPracticeMeeting;
    documents: WorkspaceDocument[];
}> {
    if (empty(input.name)) {
        return {
            ok: false,
            reason: "invalid",
            message: "Give the practice meeting an agenda.",
        };
    }
    if (input.name.length > WORKSPACE_LIMITS.promptChars) {
        return {
            ok: false,
            reason: "invalid",
            message: "The meeting agenda is longer than the practice ceiling.",
        };
    }
    if (input.agenda.length > WORKSPACE_LIMITS.promptChars) {
        return {
            ok: false,
            reason: "invalid",
            message: "The meeting context is longer than the practice ceiling.",
        };
    }
    if (!baseInstructions || empty(baseInstructions)) {
        return {
            ok: false,
            reason: "base_instructions_unavailable",
            message:
                "The approved base instructions are unavailable for this recording.",
        };
    }
    if (practiceMeetingCount(state) >= WORKSPACE_LIMITS.practiceSetups) {
        return {
            ok: false,
            reason: "limit_reached",
            message: `The practice workspace already holds ${WORKSPACE_LIMITS.practiceSetups} setups.`,
        };
    }

    const uniquePersonaIds = Array.from(new Set(input.personaIds));
    if (uniquePersonaIds.length === 0) {
        return {
            ok: false,
            reason: "invalid",
            message: "Select at least one practice participant.",
        };
    }
    if (uniquePersonaIds.length > WORKSPACE_LIMITS.personas) {
        return {
            ok: false,
            reason: "invalid",
            message: `A practice meeting can include at most ${WORKSPACE_LIMITS.personas} participants.`,
        };
    }

    const participants: LocalPracticeParticipant[] = [];
    for (const personaId of uniquePersonaIds) {
        const persona = state.personas.find(
            (candidate) => candidate.personaId === personaId
        );
        if (!persona) {
            return {
                ok: false,
                reason: "invalid",
                message: "A selected persona is no longer in the practice catalog.",
            };
        }
        if (!activeRevision(persona)) {
            return {
                ok: false,
                reason: "invalid",
                message: `"${persona.name}" has no active prompt.`,
            };
        }
        const captured = participant(persona, baseInstructions, deps);
        if (!captured) {
            return {
                ok: false,
                reason: "invalid",
                message: `"${persona.name}" could not be captured.`,
            };
        }
        participants.push(captured);
    }

    const uniqueSampleIds = Array.from(new Set(input.sampleIds));
    if (uniqueSampleIds.length > WORKSPACE_LIMITS.concurrentDocumentOps) {
        return {
            ok: false,
            reason: "concurrent_limit",
            message: `Stage at most ${WORKSPACE_LIMITS.concurrentDocumentOps} prepared samples at once.`,
        };
    }
    if (state.documents.length + uniqueSampleIds.length > WORKSPACE_LIMITS.documents) {
        return {
            ok: false,
            reason: "limit_reached",
            message:
                "This workspace reached its document record limit. Remove a document or reset the demo.",
        };
    }
    if (
        concurrentOperationCount(state.documents) + uniqueSampleIds.length >
        WORKSPACE_LIMITS.concurrentDocumentOps
    ) {
        return {
            ok: false,
            reason: "concurrent_limit",
            message:
                "Two prepared documents are already processing. Wait for one to finish before creating this setup.",
        };
    }

    const meetingId = localMeetingId(deps);
    const meeting: LocalPracticeMeeting = {
        meetingId,
        name: input.name.trim(),
        agenda: input.agenda.trim(),
        createdAt: deps.clock(),
        participants,
        sampleIds: uniqueSampleIds,
    };

    let next: WorkspaceLocalState = {
        ...state,
        practiceMeetings: [...state.practiceMeetings, meeting],
    };
    const documents: WorkspaceDocument[] = [];
    for (const sampleId of uniqueSampleIds) {
        const sample = samples.find(
            (candidate) => candidate.sampleId === sampleId
        );
        if (!sample) {
            return {
                ok: false,
                reason: "sample_unavailable",
                message: "A staged sample is no longer available in this workspace.",
            };
        }
        if (!sample.destinationKinds.includes("meeting")) {
            return {
                ok: false,
                reason: "destination_not_allowed",
                message: "A staged sample cannot be attached to a meeting.",
            };
        }
        const result = addLocalDocument(
            next,
            sample,
            { kind: "meeting", id: meetingId },
            {
                documentId: deps.idFactory("practice-document"),
                operationId: deps.idFactory("practice-operation"),
                revisionId: deps.idFactory("practice-revision"),
                createdAt: deps.clock(),
            }
        );
        if (!result.ok) {
            return {
                ok: false,
                reason: result.reason,
                message:
                    result.reason === "duplicate_sample"
                        ? "A staged sample is already present in this setup."
                        : result.reason === "concurrent_limit"
                          ? "Two prepared documents are already processing."
                          : result.reason === "limit_reached"
                            ? "This workspace reached its document record limit."
                            : "The prepared sample cannot be added to this setup.",
            };
        }
        next = result.state;
        documents.push(result.document);
    }

    return { ok: true, state: next, value: { meeting, documents } };
}

export function discardLocalPracticeMeeting(
    state: WorkspaceLocalState,
    meetingId: string
): WorkspaceLocalState {
    const meeting = state.practiceMeetings.find(
        (candidate) => candidate.meetingId === meetingId
    );
    if (!meeting) return state;

    let next = state;
    for (const document of state.documents) {
        if (
            document.scopeKind === "meeting" &&
            document.scopeId === meetingId &&
            document.status !== "revoked"
        ) {
            next = removeLocalDocument(next, document.documentId);
        }
    }
    return {
        ...next,
        practiceMeetings: next.practiceMeetings.filter(
            (candidate) => candidate.meetingId !== meetingId
        ),
    };
}

export function findLocalPracticeMeeting(
    state: WorkspaceLocalState,
    meetingId: string
): LocalPracticeMeeting | undefined {
    return state.practiceMeetings.find(
        (candidate) => candidate.meetingId === meetingId
    );
}
