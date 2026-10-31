import {
    DecodeError,
    decodeObject,
    requireArray,
    requireNumber,
    requireString,
} from "@/shared/api/decode";
import {
    WORKSPACE_LIMITS,
    type WorkspacePersona,
    type WorkspacePracticeSetup,
    type WorkspaceRevision,
    type WorkspaceSeed,
    type WorkspaceStack,
} from "./contract";

export const SUPPORTED_WORKSPACE_SEED_VERSIONS = [1] as const;

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
        fail(`${path}.prompt`, "prompt exceeds the practice ceiling");
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

function decodePracticeSetup(
    value: unknown,
    path: string
): WorkspacePracticeSetup {
    const record = decodeObject(value, path);
    return {
        setupId: requireString(record.setup_id, `${path}.setup_id`),
        label: requireString(record.label, `${path}.label`),
        description: requireString(record.description, `${path}.description`),
        recordedExampleId: requireString(
            record.recorded_example_id,
            `${path}.recorded_example_id`
        ),
    };
}

export function decodeWorkspaceSeed(value: unknown): WorkspaceSeed {
    const record = decodeObject(value, "workspace-seed");
    const seedVersion = requireNumber(record.seed_version, "workspace-seed.seed_version");
    if (!(SUPPORTED_WORKSPACE_SEED_VERSIONS as readonly number[]).includes(seedVersion)) {
        fail("workspace-seed.seed_version", "unsupported seed version");
    }
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
    const practiceSetups = requireArray(
        record.practice_setups,
        "workspace-seed.practice_setups",
        decodePracticeSetup
    );

    if (personas.length > WORKSPACE_LIMITS.personas) {
        fail("workspace-seed.personas", "persona ceiling exceeded");
    }
    if (stacks.length > WORKSPACE_LIMITS.stacks) {
        fail("workspace-seed.stacks", "stack ceiling exceeded");
    }
    if (practiceSetups.length > WORKSPACE_LIMITS.practiceSetups) {
        fail("workspace-seed.practice_setups", "practice setup ceiling exceeded");
    }

    const personaIds = new Set<string>();
    const stackIds = new Set<string>();
    for (const stack of stacks) {
        if (stackIds.has(stack.stackId)) {
            fail("workspace-seed.stacks", "stack ids must be unique");
        }
        stackIds.add(stack.stackId);
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

    return {
        seedVersion,
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
        practiceSetups,
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
