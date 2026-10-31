/**
 * Wire decoder compatibility entry (spec-06).
 *
 * The canonical types and decoders now live in `../model/types` so the shared
 * presentation and demo transport can import them without the live API layer.
 */
export {
    decodePersona,
    decodePromptRevision,
    requirePersonaListResponse,
    type Persona,
    type PersonaGenerationSettings,
    type PersonaListResponse,
    type PromptRevision,
} from '../model/types';
