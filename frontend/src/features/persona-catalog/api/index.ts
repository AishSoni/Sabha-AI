/**
 * Public interface of the persona catalog capability (spec-05).
 *
 * Curated barrel: no wildcards. Consumers (like the meetings create flow) go
 * through these names only.
 */
export { personaKeys } from './keys';
export { personaClient } from './client';
export { decodePersona, type Persona, type PersonaListResponse } from './decoders';
export { usePersonaList } from './queries';
