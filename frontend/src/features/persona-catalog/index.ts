/**
 * Public interface of the persona catalog capability (spec-05).
 *
 * Curated root barrel mirroring the api barrel. Import boundaries point
 * consumers at this module, never at deep paths inside the feature.
 */
export {
    decodePersona,
    personaClient,
    personaKeys,
    usePersonaList,
    type Persona,
    type PersonaListResponse,
} from './api';
