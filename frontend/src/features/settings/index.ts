/**
 * Public surface of the settings feature (spec-05, spec-10).
 */
export {
    settingsKeys,
    settingsClient,
    useFetchProviderModels,
    useProvidersEnvironment,
    useTestProviderKey,
    useUpdateSystemAI,
} from './api';
export type {
    FetchProviderModelsInput,
    TestProviderKeyInput,
    UpdateSystemAIInput,
    FetchedModelInfoView,
    FetchModelsResultView,
    ProviderInfoView,
    ProviderModelInfoView,
    ProvidersEnvironment,
    EnvironmentInfoView,
    SystemAIConfigView,
    TestProviderKeyResultView,
} from './api';
export { SettingsScreen } from './components/SettingsScreen';
export {
    useSettingsStore,
    type GenerationSettings,
    type ProviderConfig,
    type SettingsState,
} from './state/settings-store';
