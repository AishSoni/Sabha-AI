/**
 * Public surface of the settings feature (spec-05).
 */
export { settingsKeys, settingsClient, useProvidersEnvironment } from './api';
export {
    useSettingsStore,
    type GenerationSettings,
    type ProviderConfig,
    type SettingsState,
    type SystemAIConfig,
} from './state/settings-store';
export type {
    ProviderInfoView,
    ProviderModelInfoView,
    ProvidersEnvironment,
    EnvironmentInfoView,
    SystemAIConfigView,
} from './api';
