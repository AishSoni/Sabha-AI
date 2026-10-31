/**
 * Safe presentation entry for the persona catalog (spec-23/24).
 *
 * Demo adapters import this module, never the live client/hook barrel. It
 * contains the pure list, the shared screens, the canonical types, and the
 * transport-bound client factory — but no live transport, store, or hook.
 */
export {
    RosterList,
    type RosterHrefs,
    type RosterListProps,
    type RosterPersonaView,
} from './presentation/roster-list';
export { RosterScreen, type RosterScreenProps } from './presentation/roster-screen';
export {
    NewPersonaScreen,
    type NewPersonaRoutes,
    type NewPersonaScreenProps,
} from './presentation/new-persona-screen';
export {
    PersonaEditorScreen,
    type PersonaEditorRoutes,
    type PersonaEditorScreenProps,
} from './presentation/persona-editor-screen';
export {
    createPersonaClient,
    type PersonaCatalogClient,
    type PersonaRequest,
    type PersonaRequestInit,
} from './model/client';
export {
    normalizeStackIds,
    validatePersonaTemplate,
    type PersonaTemplateFields,
} from './presentation/validation';
export {
    decodePersona,
    decodePromptRevision,
    requirePersonaListResponse,
    type Persona,
    type PersonaCreateInput,
    type PersonaGenerationSettings,
    type PersonaListResponse,
    type PersonaStackOption,
    type PersonaUpdateInput,
    type PromptRevision,
} from './model/types';
