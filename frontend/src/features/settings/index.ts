/**
 * Public surface of the settings feature (spec-05, spec-10).
 */
export {
    settingsKeys,
    settingsClient,
    useFetchProviderModels,
    useProvidersEnvironment,
    useSettingsDiagnostics,
    useTestProviderKey,
    useUpdateSystemAI,
} from './api';
export type {
    FetchProviderModelsInput,
    TestProviderKeyInput,
    UpdateSystemAIInput,
    CapabilityDiagnosticView,
    CapabilityStateView,
    EmbeddingDiagnosticView,
    ExecutionDiagnosticView,
    FetchedModelInfoView,
    FetchModelsResultView,
    KnowledgeDiagnosticView,
    ProviderDiagnosticView,
    ProviderInfoView,
    ProviderModelInfoView,
    ProvidersEnvironment,
    SettingsDiagnosticsView,
    EnvironmentInfoView,
    SystemAIConfigView,
    SystemAIStateView,
    SystemAIStatusView,
    SystemAISourceView,
    TestProviderKeyResultView,
} from './api';
export { SettingsScreen } from './components/SettingsScreen';
export {
    useSettingsStore,
    type GenerationSettings,
    type ProviderConfig,
    type SettingsState,
} from './state/settings-store';
