/**
 * Compatibility re-export for the settings store.
 *
 * Ownership moved to the settings feature (spec-10). Existing callers keep
 * working through this path until their migration commits land; the file is
 * removed once the last caller imports '@/features/settings'.
 */
export {
    useSettingsStore,
    type GenerationSettings,
    type ProviderConfig,
    type SettingsState,
    type SystemAIConfig,
} from '@/features/settings/state/settings-store';
