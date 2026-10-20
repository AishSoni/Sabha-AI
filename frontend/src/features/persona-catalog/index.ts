/**
 * Public interface of the persona catalog capability (spec-05/06).
 *
 * Curated root barrel mirroring the api barrel. Import boundaries point
 * consumers at this module, never at deep paths inside the feature.
 */
export {
    decodePersona,
    decodePromptRevision,
    personaClient,
    personaKeys,
    usePersonaList,
    type Persona,
    type PersonaCreateInput,
    type PersonaGenerationSettings,
    type PersonaListResponse,
    type PromptRevision,
    type PersonaUpdateInput,
} from './api';
