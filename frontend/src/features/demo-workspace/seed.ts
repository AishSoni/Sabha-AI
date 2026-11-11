import {
    DecodeError,
    decodeObject,
    requireArray,
    requireNumber,
    requireString,
} from "@/shared/api/decode";
import {
    WORKSPACE_LIMITS,
    type WorkspaceDocument,
    type WorkspacePersona,
    type WorkspaceRevision,
    type WorkspaceSample,
    type WorkspaceSampleRole,
    type WorkspaceSeed,
    type WorkspaceStack,
} from "./contract";

export const SUPPORTED_WORKSPACE_SEED_VERSIONS = [1, 2, 3] as const;

const SAMPLE_ROLES: readonly WorkspaceSampleRole[] = [
    "shared-research",
    "participant-notes",
    "mandate-material",
    "failure-retry",
];
const SAMPLE_DESTINATIONS = ["meeting", "stack"] as const;
const SAMPLE_SCENARIOS = ["ready-after-indexing", "fail-once"] as const;
const SAMPLE_PREVIEW_MODES = ["inline", "unsupported"] as const;

function optionalText(value: unknown, path: string): string | null {
    if (value === undefined || value === null) return null;
    return requireString(value, path);
}

export interface WorkspaceSeedEnvelope {
    packageId: string;
    version: string;
    contentSha256: string;
    seedVersion: number;
    seed: WorkspaceSeed;
}

function fail(path: string, message: string): never {
    throw new DecodeError(`${path}: ${message}`);
}

function decodeRevision(value: unknown, path: string): WorkspaceRevision {
    const record = decodeObject(value, path);
    const prompt = requireString(record.prompt, `${path}.prompt`);
    if (prompt.length === 0 || prompt.length > WORKSPACE_LIMITS.promptChars) {
        fail(`${path}.prompt`, "prompt exceeds the demo ceiling");
    }
    return {
        revisionId: requireString(record.revision_id, `${path}.revision_id`),
        prompt,
        reason: requireString(record.reason, `${path}.reason`),
        createdAt: requireString(record.created_at, `${path}.created_at`),
    };
}

function decodePersona(value: unknown, path: string): WorkspacePersona {
    const record = decodeObject(value, path);
    const revisions = requireArray(
        record.revisions,
        `${path}.revisions`,
        decodeRevision
    );
    if (revisions.length === 0) {
        fail(`${path}.revisions`, "a persona needs at least one revision");
    }
    if (revisions.length > WORKSPACE_LIMITS.revisionsPerPersona) {
        fail(`${path}.revisions`, "persona exceeds the revision ceiling");
    }
    const revisionIds = new Set<string>();
    for (const revision of revisions) {
        if (revisionIds.has(revision.revisionId)) {
            fail(`${path}.revisions`, "revision ids must be unique");
        }
        revisionIds.add(revision.revisionId);
    }
    const activeRevisionId = requireString(
        record.active_revision_id,
        `${path}.active_revision_id`
    );
    if (!revisionIds.has(activeRevisionId)) {
        fail(`${path}.active_revision_id`, "active revision is missing");
    }
    return {
        personaId: requireString(record.persona_id, `${path}.persona_id`),
        name: requireString(record.name, `${path}.name`),
        role: requireString(record.role, `${path}.role`),
        description: requireString(record.description, `${path}.description`),
        color: requireString(record.color, `${path}.color`),
        stackIds: requireArray(
            record.stack_ids,
            `${path}.stack_ids`,
            (item, itemPath) => requireString(item, itemPath)
        ),
        revisions,
        activeRevisionId,
        recordedParticipantId: optionalText(
            record.recorded_participant_id,
            `${path}.recorded_participant_id`
        ),
    };
}

function decodeStack(value: unknown, path: string): WorkspaceStack {
    const record = decodeObject(value, path);
    const scope = requireString(record.scope, `${path}.scope`);
    if (scope !== "shared" && scope !== "private") {
        fail(`${path}.scope`, "scope must be shared or private");
    }
    return {
        stackId: requireString(record.stack_id, `${path}.stack_id`),
        label: requireString(record.label, `${path}.label`),
        scope,
        description: requireString(record.description, `${path}.description`),
    };
}

function requireMember<T extends string>(
    value: unknown,
    allowed: readonly T[],
    path: string
): T {
    const text = requireString(value, path);
    if (!(allowed as readonly string[]).includes(text)) {
        fail(path, `unsupported value ${text}`);
    }
    return text as T;
}

function requireCount(value: unknown, path: string, maximum: number): number {
    const count = requireNumber(value, path);
    if (!Number.isInteger(count) || count < 1 || count > maximum) {
        fail(path, "count is outside the allowed range");
    }
    return count;
}

function decodeSample(value: unknown, path: string): WorkspaceSample {
    const record = decodeObject(value, path);
    const sampleId = requireString(record.sample_id, `${path}.sample_id`);
    if (sampleId.length === 0 || !/^[a-z0-9][a-z0-9-]*$/.test(sampleId)) {
        fail(`${path}.sample_id`, "sample id is not safe");
    }
    const fileName = requireString(record.file_name, `${path}.file_name`);
    if (
        fileName.length === 0 ||
        fileName.includes("/") ||
        fileName.includes("\\") ||
        fileName !== fileName.split(/[\\/]/).pop()
    ) {
        fail(`${path}.file_name`, "file name must be plain");
    }
    const sha256 = requireString(record.sha256, `${path}.sha256`);
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
        fail(`${path}.sha256`, "sha256 must be lowercase hexadecimal");
    }
    const approvedAt = requireString(record.approved_at, `${path}.approved_at`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(approvedAt)) {
        fail(`${path}.approved_at`, "approval date must be ISO formatted");
    }
    const previewMode = requireMember(
        record.preview_mode,
        SAMPLE_PREVIEW_MODES,
        `${path}.preview_mode`
    );
    const previewNote = optionalText(record.preview_note, `${path}.preview_note`);
    if (previewMode === "unsupported" && !previewNote) {
        fail(`${path}.preview_note`, "unsupported preview needs an explanation");
    }
    if (previewMode === "inline" && previewNote !== null) {
        fail(`${path}.preview_note`, "inline preview must not carry a limitation note");
    }
    const scenarioId = requireMember(
        record.scenario_id,
        SAMPLE_SCENARIOS,
        `${path}.scenario_id`
    );
    const failureMessage = optionalText(
        record.failure_message,
        `${path}.failure_message`
    );
    if (scenarioId === "fail-once" && !failureMessage) {
        fail(`${path}.failure_message`, "fail-once needs a safe explanation");
    }
    if (scenarioId !== "fail-once" && failureMessage !== null) {
        fail(`${path}.failure_message`, "only fail-once may carry a failure");
    }
    const destinationKinds = requireArray(
        record.destination_kinds,
        `${path}.destination_kinds`,
        (item, itemPath) =>
            requireMember(item, SAMPLE_DESTINATIONS, itemPath)
    );
    if (new Set(destinationKinds).size !== destinationKinds.length) {
        fail(`${path}.destination_kinds`, "destinations must be unique");
    }
    return {
        sampleId,
        assetId: requireString(record.asset_id, `${path}.asset_id`),
        fileName,
        mediaType: requireString(record.media_type, `${path}.media_type`),
        sizeBytes: requireCount(
            record.size_bytes,
            `${path}.size_bytes`,
            WORKSPACE_LIMITS.sampleBytes
        ),
        sha256,
        role: requireMember(record.role, SAMPLE_ROLES, `${path}.role`),
        destinationKinds,
        description: requireString(record.description, `${path}.description`),
        accessibleLabel: requireString(
            record.accessible_label,
            `${path}.accessible_label`
        ),
        provenance: requireMember(
            record.provenance,
            ["demo-authored", "approved-source"] as const,
            `${path}.provenance`
        ),
        rightsStatus: requireMember(
            record.rights_status,
            ["approved-for-upload"] as const,
            `${path}.rights_status`
        ),
        approvedAt,
        previewMode,
        previewNote,
        scenarioId,
        preparedChunkCount: requireCount(
            record.prepared_chunk_count,
            `${path}.prepared_chunk_count`,
            WORKSPACE_LIMITS.chunksPerDocument
        ),
        failureMessage,
    };
}

function decodeDocument(value: unknown, path: string): WorkspaceDocument {
    const record = decodeObject(value, path);
    const scopeKind = requireMember(
        record.scope_kind,
        SAMPLE_DESTINATIONS,
        `${path}.scope_kind`
    );
    const status = requireMember(
        record.status,
        ["ready"] as const,
        `${path}.status`
    );
    return {
        documentId: requireString(record.document_id, `${path}.document_id`),
        sampleId: requireString(record.sample_id, `${path}.sample_id`),
        scopeKind,
        scopeId: requireString(record.scope_id, `${path}.scope_id`),
        status,
        operationId: requireString(record.operation_id, `${path}.operation_id`),
        revisionId: requireString(record.revision_id, `${path}.revision_id`),
        chunkCount: requireCount(
            record.chunk_count,
            `${path}.chunk_count`,
            WORKSPACE_LIMITS.chunksPerDocument
        ),
        createdAt: requireString(record.created_at, `${path}.created_at`),
    };
}

export function decodeWorkspaceSeed(value: unknown): WorkspaceSeed {
    const record = decodeObject(value, "workspace-seed");
    const seedVersion = requireNumber(record.seed_version, "workspace-seed.seed_version");
    if (!(SUPPORTED_WORKSPACE_SEED_VERSIONS as readonly number[]).includes(seedVersion)) {
        fail("workspace-seed.seed_version", "unsupported seed version");
    }
    const baseInstructions = optionalText(
        record.base_instructions,
        "workspace-seed.base_instructions"
    );
    const highlightedPersonaId = optionalText(
        record.highlighted_persona_id,
        "workspace-seed.highlighted_persona_id"
    );
    const disclosure = decodeObject(
        record.disclosure,
        "workspace-seed.disclosure"
    );
    const personas = requireArray(
        record.personas,
        "workspace-seed.personas",
        decodePersona
    );
    const stacks = requireArray(
        record.stacks,
        "workspace-seed.stacks",
        decodeStack
    );
    const samples =
        seedVersion >= 3
            ? requireArray(record.samples, "workspace-seed.samples", decodeSample)
            : [];
    const documents =
        seedVersion >= 3
            ? requireArray(
                  record.documents,
                  "workspace-seed.documents",
                  decodeDocument
              )
            : [];

    if (seedVersion < 3 && (record.samples !== undefined || record.documents !== undefined)) {
        fail(
            "workspace-seed.seed_version",
            "sample library requires seed version 3"
        );
    }
    if (samples.length > WORKSPACE_LIMITS.samples) {
        fail("workspace-seed.samples", "sample ceiling exceeded");
    }
    if (documents.length > WORKSPACE_LIMITS.documents) {
        fail("workspace-seed.documents", "document ceiling exceeded");
    }

    if (personas.length > WORKSPACE_LIMITS.personas) {
        fail("workspace-seed.personas", "persona ceiling exceeded");
    }
    if (stacks.length > WORKSPACE_LIMITS.stacks) {
        fail("workspace-seed.stacks", "stack ceiling exceeded");
    }

    const personaIds = new Set<string>();
    const stackIds = new Set<string>();
    for (const stack of stacks) {
        if (stackIds.has(stack.stackId)) {
            fail("workspace-seed.stacks", "stack ids must be unique");
        }
        stackIds.add(stack.stackId);
    }
    const sampleIds = new Map<string, WorkspaceSample>();
    let totalSampleBytes = 0;
    for (const sample of samples) {
        if (sampleIds.has(sample.sampleId)) {
            fail("workspace-seed.samples", "sample ids must be unique");
        }
        sampleIds.set(sample.sampleId, sample);
        totalSampleBytes += sample.sizeBytes;
    }
    if (totalSampleBytes > WORKSPACE_LIMITS.totalSampleBytes) {
        fail("workspace-seed.samples", "total sample byte ceiling exceeded");
    }
    if (seedVersion >= 3 && samples.length === 0) {
        fail("workspace-seed.samples", "seed version 3 requires an upload allowlist");
    }

    const documentIds = new Set<string>();
    for (const document of documents) {
        if (documentIds.has(document.documentId)) {
            fail("workspace-seed.documents", "document ids must be unique");
        }
        documentIds.add(document.documentId);
        const sample = sampleIds.get(document.sampleId);
        if (!sample) {
            fail(
                `workspace-seed.documents.${document.documentId}.sample_id`,
                "sample is not seeded"
            );
        }
        if (!sample.destinationKinds.includes(document.scopeKind)) {
            fail(
                `workspace-seed.documents.${document.documentId}.scope_kind`,
                "destination is not allowed for this sample"
            );
        }
        if (document.scopeKind === "meeting") {
            fail(
                `workspace-seed.documents.${document.documentId}.scope_kind`,
                "seeded documents must use a stack scope"
            );
        }
        if (!stackIds.has(document.scopeId)) {
            fail(
                `workspace-seed.documents.${document.documentId}.scope_id`,
                "stack is not seeded"
            );
        }
        if (document.chunkCount !== sample.preparedChunkCount) {
            fail(
                `workspace-seed.documents.${document.documentId}.chunk_count`,
                "chunk count does not match the sample"
            );
        }
    }

    let promptCharacters = 0;
    for (const persona of personas) {
        if (personaIds.has(persona.personaId)) {
            fail("workspace-seed.personas", "persona ids must be unique");
        }
        personaIds.add(persona.personaId);
        for (const stackId of persona.stackIds) {
            if (!stackIds.has(stackId)) {
                fail(
                    `workspace-seed.personas.${persona.personaId}.stack_ids`,
                    "stack is not seeded"
                );
            }
        }
        for (const revision of persona.revisions) {
            promptCharacters += revision.prompt.length;
        }
    }
    if (promptCharacters > WORKSPACE_LIMITS.totalPromptChars) {
        fail("workspace-seed.personas", "total prompt ceiling exceeded");
    }

    if (seedVersion >= 2) {
        if (!baseInstructions || baseInstructions.trim().length === 0) {
            fail("workspace-seed.base_instructions", "seed version 2 requires base instructions");
        }
        if (baseInstructions.length > WORKSPACE_LIMITS.baseInstructionChars) {
            fail("workspace-seed.base_instructions", "base instructions exceed the ceiling");
        }
        if (!highlightedPersonaId || !personaIds.has(highlightedPersonaId)) {
            fail(
                "workspace-seed.highlighted_persona_id",
                "highlighted persona is missing"
            );
        }
    } else if (
        baseInstructions !== null ||
        highlightedPersonaId !== null ||
        personas.some((persona) => persona.recordedParticipantId)
    ) {
        fail("workspace-seed.seed_version", "prompt assembly metadata requires seed version 2");
    }

    return {
        seedVersion,
        baseInstructions,
        highlightedPersonaId,
        disclosure: {
            practice: requireString(
                disclosure.practice,
                "workspace-seed.disclosure.practice"
            ),
            recording: requireString(
                disclosure.recording,
                "workspace-seed.disclosure.recording"
            ),
        },
        personas,
        stacks,
        samples,
        documents,
    };
}

export function decodeWorkspaceSeedEnvelope(
    value: unknown
): WorkspaceSeedEnvelope {
    const record = decodeObject(value, "workspace-seed");
    return {
        packageId: requireString(record.package_id, "workspace-seed.package_id"),
        version: requireString(record.version, "workspace-seed.version"),
        contentSha256: requireString(
            record.content_sha256,
            "workspace-seed.content_sha256"
        ),
        seedVersion: requireNumber(
            record.seed_version,
            "workspace-seed.seed_version"
        ),
        seed: decodeWorkspaceSeed(record.seed),
    };
}
