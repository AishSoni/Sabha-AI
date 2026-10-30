/**
 * Browser-composed generation settings shared by the live command client and
 * the runtime contract. Kept free of transport imports so the recorded replay
 * graph can depend on the shape without reaching the live Auth adapter.
 */
export interface TurnGenerationSettings {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    baseUrl?: string;
    apiKey?: string;
}
