/**
 * Neutral turn command/observation shapes. Imported by the live client and
 * the runtime-scoped hooks without pulling the authenticated transport into
 * the recorded replay graph.
 */
import type { TurnGenerationSettings } from './generation-settings';

export interface TurnReadOptions {
    signal?: AbortSignal;
}

export interface SubmitTurnInput extends TurnReadOptions {
    participantId: string;
    requestKey: string;
    settings?: TurnGenerationSettings;
}

export interface ObserveTurnOptions extends TurnReadOptions {
    after?: number;
}
