/**
 * Pure local persona-catalog transitions (spec-24).
 *
 * These functions mirror the live catalog's observable behaviour without
 * importing its transport. The demo transport wraps them in the same request
 * paths the live client already uses, so the screens and decoders stay one
 * implementation.
 */
import {
    WORKSPACE_LIMITS,
    type LocalParticipantSnapshot,
    type WorkspaceLocalState,
    type WorkspacePersona,
    type WorkspaceRevision,
} from '@/features/demo-workspace';
import type { PersonaCreateInput, PersonaUpdateInput } from '../model/types';
import { normalizeStackIds, validatePersonaTemplate } from '../presentation/validation';

export interface LocalCatalogDeps {
    idFactory: () => string;
    clock: () => string;
}

export type LocalCatalogFailureCode = 'not_found' | 'invalid' | 'limit_reached';

export type LocalCatalogResult<T> =
    | { ok: true; state: WorkspaceLocalState; value: T }
    | { ok: false; code: LocalCatalogFailureCode; status: number; message: string };

export interface PersonaWire {
    id: string;
    name: string;
    subtitle: string | null;
    color: string;
    avatar_url: null;
    provider_config: null;
    is_default: boolean;
    stack_ids: string[];
    user_id: null;
    created_at: string;
    updated_at: string;
    active_prompt: string | null;
    active_prompt_version: number | null;
}

export interface RevisionWire {
    id: string;
    persona_id: string;
    version: number;
    content: string;
    is_active: boolean;
    created_at: string;
}

function failure(
    code: LocalCatalogFailureCode,
    message: string,
    status: number
): LocalCatalogResult<never> {
    return { ok: false, code, status, message };
}

function replacePersona(
    state: WorkspaceLocalState,
    persona: WorkspacePersona
): WorkspaceLocalState {
    return {
        ...state,
        personas: state.personas.map((item) =>
            item.personaId === persona.personaId ? persona : item
        ),
    };
}

export function activeRevision(
    persona: WorkspacePersona
): WorkspaceRevision | null {
    return (
        persona.revisions.find(
            (revision) => revision.revisionId === persona.activeRevisionId
        ) ??
        persona.revisions[persona.revisions.length - 1] ??
        null
    );
}

function validateStacks(
    stackIds: string[],
    state: WorkspaceLocalState
): string | null {
    const available = new Set(state.stacks.map((stack) => stack.stackId));
    const unknown = stackIds.filter((stackId) => !available.has(stackId));
    if (unknown.length === 0) return null;
    return `Unknown knowledge stack: ${unknown.join(', ')}`;
}

export function createPersona(
    state: WorkspaceLocalState,
    input: PersonaCreateInput,
    deps: LocalCatalogDeps
): LocalCatalogResult<{ persona: WorkspacePersona }> {
    const problems = validatePersonaTemplate({
        name: input.name,
        subtitle: input.subtitle,
        color: input.color,
    });
    if (problems.length > 0) {
        return failure('invalid', problems.join('; '), 400);
    }
    if (state.personas.length >= WORKSPACE_LIMITS.personas) {
        return failure(
            'limit_reached',
            `The practice catalog already holds ${WORKSPACE_LIMITS.personas} personas.`,
            409
        );
    }
    const stackIds = normalizeStackIds(input.stack_ids);
    const stackProblem = validateStacks(stackIds, state);
    if (stackProblem) return failure('invalid', stackProblem, 400);

    const prompt = input.system_prompt ?? '';
    if (prompt.length > WORKSPACE_LIMITS.promptChars) {
        return failure('invalid', 'The system prompt exceeds the practice ceiling.', 400);
    }

    const createdAt = deps.clock();
    const revision: WorkspaceRevision = {
        revisionId: deps.idFactory(),
        prompt,
        reason: 'Initial local version.',
        createdAt,
        origin: 'local',
    };
    const persona: WorkspacePersona = {
        personaId: deps.idFactory(),
        name: input.name,
        role: (input.subtitle ?? '').trim() || 'AI Assistant',
        description: '',
        color: input.color ?? '#6366f1',
        stackIds,
        revisions: [revision],
        activeRevisionId: revision.revisionId,
        recordedParticipantId: null,
    };

    return {
        ok: true,
        state: { ...state, personas: [persona, ...state.personas] },
        value: { persona },
    };
}

export function updatePersona(
    state: WorkspaceLocalState,
    personaId: string,
    input: PersonaUpdateInput
): LocalCatalogResult<{ persona: WorkspacePersona }> {
    const persona = state.personas.find((item) => item.personaId === personaId);
    if (!persona) return failure('not_found', 'Persona not found.', 404);

    const problems = validatePersonaTemplate({
        name: input.name,
        subtitle: input.subtitle,
        color: input.color,
    });
    if (problems.length > 0) {
        return failure('invalid', problems.join('; '), 400);
    }

    let stackIds = persona.stackIds;
    if (input.stack_ids !== undefined && input.stack_ids !== null) {
        stackIds = normalizeStackIds(input.stack_ids);
        const stackProblem = validateStacks(stackIds, state);
        if (stackProblem) return failure('invalid', stackProblem, 400);
    }

    const updated: WorkspacePersona = {
        ...persona,
        // The live update uses COALESCE: null and undefined both mean "keep".
        name: input.name ?? persona.name,
        role: input.subtitle ?? persona.role,
        color: input.color ?? persona.color,
        stackIds,
        // Metadata writes never touch prompt history.
        revisions: persona.revisions,
        activeRevisionId: persona.activeRevisionId,
    };

    return {
        ok: true,
        state: replacePersona(state, updated),
        value: { persona: updated },
    };
}

export function deletePersona(
    state: WorkspaceLocalState,
    personaId: string
): LocalCatalogResult<null> {
    if (!state.personas.some((item) => item.personaId === personaId)) {
        return failure('not_found', 'Persona not found.', 404);
    }
    return {
        ok: true,
        state: {
            ...state,
            personas: state.personas.filter((item) => item.personaId !== personaId),
        },
        value: null,
    };
}

export function duplicatePersona(
    state: WorkspaceLocalState,
    personaId: string,
    deps: LocalCatalogDeps
): LocalCatalogResult<{ persona: WorkspacePersona }> {
    const source = state.personas.find((item) => item.personaId === personaId);
    if (!source) return failure('not_found', 'Persona not found.', 404);
    const active = activeRevision(source);
    if (!active) return failure('invalid', 'The persona has no prompt to copy.', 409);

    const copied = createPersona(
        state,
        {
            // The live duplicate flow copies these fields and deliberately does
            // not copy stack assignments or the source revision identities.
            name: `${source.name} (Copy)`,
            subtitle: source.role,
            color: source.color,
            system_prompt: active.prompt,
        },
        deps
    );
    if (!copied.ok) return copied;

    const persona = copied.value.persona;
    const [initial] = persona.revisions;
    const updated: WorkspacePersona = {
        ...persona,
        revisions: [
            {
                ...initial,
                reason: `Copied from ${source.name}'s active system prompt.`,
            },
        ],
    };
    return {
        ok: true,
        state: replacePersona(copied.state, updated),
        value: { persona: updated },
    };
}

export function saveRevision(
    state: WorkspaceLocalState,
    personaId: string,
    content: string,
    deps: LocalCatalogDeps
): LocalCatalogResult<{
    persona: WorkspacePersona;
    revision: WorkspaceRevision;
}> {
    const persona = state.personas.find((item) => item.personaId === personaId);
    if (!persona) return failure('not_found', 'Persona not found.', 404);
    if (persona.revisions.length >= WORKSPACE_LIMITS.revisionsPerPersona) {
        return failure(
            'limit_reached',
            `This persona already holds ${WORKSPACE_LIMITS.revisionsPerPersona} revisions.`,
            409
        );
    }
    if (content.length > WORKSPACE_LIMITS.promptChars) {
        return failure('invalid', 'The system prompt exceeds the practice ceiling.', 400);
    }

    const revision: WorkspaceRevision = {
        revisionId: deps.idFactory(),
        prompt: content,
        reason: 'Temporary local edit.',
        createdAt: deps.clock(),
        origin: 'local',
    };
    const updated: WorkspacePersona = {
        ...persona,
        revisions: [...persona.revisions, revision],
        activeRevisionId: revision.revisionId,
    };
    return {
        ok: true,
        state: replacePersona(state, updated),
        value: { persona: updated, revision },
    };
}

export function activateRevision(
    state: WorkspaceLocalState,
    personaId: string,
    version: number
): LocalCatalogResult<{ persona: WorkspacePersona }> {
    const persona = state.personas.find((item) => item.personaId === personaId);
    if (!persona) return failure('not_found', 'Persona not found.', 404);
    const revision = persona.revisions[version - 1];
    if (!revision) return failure('not_found', `Version ${version} not found.`, 404);
    if (persona.activeRevisionId === revision.revisionId) {
        return { ok: true, state, value: { persona } };
    }
    const updated: WorkspacePersona = {
        ...persona,
        activeRevisionId: revision.revisionId,
    };
    return {
        ok: true,
        state: replacePersona(state, updated),
        value: { persona: updated },
    };
}

export function captureSnapshot(
    state: WorkspaceLocalState,
    personaId: string,
    baseInstructions: string | null,
    deps: LocalCatalogDeps
): LocalCatalogResult<{ snapshot: LocalParticipantSnapshot }> {
    const persona = state.personas.find((item) => item.personaId === personaId);
    if (!persona) return failure('not_found', 'Persona not found.', 404);
    if (state.participantSnapshots.length >= WORKSPACE_LIMITS.participantSnapshots) {
        return failure(
            'limit_reached',
            `The workspace already holds ${WORKSPACE_LIMITS.participantSnapshots} participant snapshots.`,
            409
        );
    }
    if (!baseInstructions || baseInstructions.trim().length === 0) {
        return failure(
            'invalid',
            'The approved base instructions are unavailable for this recording.',
            409
        );
    }
    const active = activeRevision(persona);
    if (!active) return failure('invalid', 'The persona has no active prompt.', 409);
    const version = persona.revisions.findIndex(
        (revision) => revision.revisionId === active.revisionId
    ) + 1;

    const snapshot: LocalParticipantSnapshot = {
        snapshotId: deps.idFactory(),
        personaId: persona.personaId,
        name: persona.name,
        role: persona.role,
        color: persona.color,
        composedPrompt: `${baseInstructions}\n\n${active.prompt}`,
        stackIds: [...persona.stackIds],
        sourceRevisionId: active.revisionId,
        sourceRevisionNumber: version,
        createdAt: deps.clock(),
    };
    return {
        ok: true,
        state: {
            ...state,
            participantSnapshots: [...state.participantSnapshots, snapshot],
        },
        value: { snapshot },
    };
}

export function personaWire(persona: WorkspacePersona): PersonaWire {
    const active = activeRevision(persona);
    const version = active
        ? persona.revisions.findIndex(
              (revision) => revision.revisionId === active.revisionId
          ) + 1
        : null;
    const first = persona.revisions[0];
    return {
        id: persona.personaId,
        name: persona.name,
        subtitle: persona.role || null,
        color: persona.color || '#6366f1',
        avatar_url: null,
        provider_config: null,
        is_default: false,
        stack_ids: [...persona.stackIds],
        user_id: null,
        created_at: first?.createdAt ?? '',
        updated_at:
            persona.revisions[persona.revisions.length - 1]?.createdAt ??
            first?.createdAt ??
            '',
        active_prompt: active?.prompt ?? null,
        active_prompt_version: version,
    };
}

export function revisionWire(
    persona: WorkspacePersona,
    revision: WorkspaceRevision,
    index: number
): RevisionWire {
    return {
        id: revision.revisionId,
        persona_id: persona.personaId,
        version: index + 1,
        content: revision.prompt,
        is_active: revision.revisionId === persona.activeRevisionId,
        created_at: revision.createdAt,
    };
}

export function personaListWire(
    state: WorkspaceLocalState
): { personas: PersonaWire[]; total: number } {
    return {
        personas: state.personas.map(personaWire),
        total: state.personas.length,
    };
}
