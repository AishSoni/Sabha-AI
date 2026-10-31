/**
 * Live persona-catalog client (spec-05/06).
 *
 * The implementation lives in `../model/client`; this module only binds it to
 * the authenticated live JSON transport. The demo binds the same client code
 * to an in-memory transport.
 */
import { requestLiveJson } from '@/shared/access';
import { createPersonaClient } from '../model/client';

export const personaClient = createPersonaClient(requestLiveJson);

export type {
    PersonaCreateInput,
    PersonaUpdateInput,
} from '../model/types';
export type { PersonaCatalogClient, PersonaRequest, PersonaRequestInit } from '../model/client';
