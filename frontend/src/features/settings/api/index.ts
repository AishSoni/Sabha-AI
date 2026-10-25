/**
 * Public surface of the settings API layer (spec-05).
 *
 * Curated barrel: no wildcard exports, and no legacy '@/lib/api' imports.
 */
export { settingsKeys } from './keys';
export { settingsClient } from './client';
export type {
    FetchProviderModelsInput,
    TestProviderKeyInput,
    UpdateSystemAIInput,
} from './client';
export { useProvidersEnvironment } from './queries';
export { useFetchProviderModels, useTestProviderKey, useUpdateSystemAI } from './mutations';
export type {
    FetchedModelInfoView,
    FetchModelsResultView,
    ProviderInfoView,
    ProviderModelInfoView,
    ProvidersEnvironment,
    EnvironmentInfoView,
    SystemAIConfigView,
    TestProviderKeyResultView,
} from './decoders';
