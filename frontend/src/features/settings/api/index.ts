/**
 * Public surface of the settings API layer (spec-05).
 *
 * Curated barrel: no wildcard exports, and no legacy '@/lib/api' imports.
 */
export { settingsKeys } from './keys';
export { settingsClient } from './client';
export { useProvidersEnvironment } from './queries';
export type {
    ProviderInfoView,
    ProviderModelInfoView,
    ProvidersEnvironment,
    EnvironmentInfoView,
    SystemAIConfigView,
} from './decoders';
