/**
 * Public interface of the persona catalog capability (spec-05/06).
 *
 * Curated barrel: no wildcards. Consumers (like the meetings create flow) go
 * through these names only.
 */
export { personaKeys } from './keys';
export {
    personaClient,
    type PersonaCreateInput,
    type PersonaUpdateInput,
} from './client';
export {
    decodePersona,
    decodePromptRevision,
    type Persona,
    type PersonaGenerationSettings,
    type PersonaListResponse,
    type PromptRevision,
} from './decoders';
export { usePersonaList } from './queries';
