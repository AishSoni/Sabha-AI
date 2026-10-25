'use client';

/**
 * Provider section of the settings screen (spec-10).
 *
 * Server metadata is read through the settings query and hydrated into the
 * local preference store on every successful fetch. Secrets stay in the
 * vault; the metadata response never contains one.
 */
import { useEffect } from 'react';
import { Loader2, Cpu } from 'lucide-react';
import { ProviderCard } from './ProviderCard';
import { SystemAiCard } from './SystemAiCard';
import { useProvidersEnvironment } from '../api';
import { useSettingsStore } from '../state/settings-store';

export function ApiKeysSection() {
    // Server-owned metadata read — TanStack Query owns this fetch; the
    // settings store keeps only the user's local choices.
    const providersQuery = useProvidersEnvironment();
    const providers = providersQuery.data?.providers ?? [];

    const {
        providers: providerConfigs,
        defaultProvider,
        isProduction,
        setProviderConfig,
        setDefaultProvider,
        initializeFromServer,
    } = useSettingsStore();

    const metadata = providersQuery.data;
    useEffect(() => {
        if (!metadata) {
            return;
        }
        initializeFromServer({
            isProduction: metadata.environment.isProduction,
            configuredProviders: metadata.environment.configuredProviders,
            defaultProvider: metadata.environment.defaultProvider,
            defaultModels: metadata.environment.defaultModels,
            systemAI: {
                provider: metadata.systemAI.provider,
                model: metadata.systemAI.model,
                temperature: metadata.systemAI.temperature,
                maxTokens: metadata.systemAI.maxTokens,
            },
        });
    }, [metadata, initializeFromServer]);

    if (providersQuery.isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
        );
    }

    if (providersQuery.error) {
        return (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <p className="text-red-400">Failed to load providers</p>
                <button
                    onClick={() => void providersQuery.refetch()}
                    className="mt-3 px-3 py-1.5 text-sm rounded-md bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold text-white">API Keys & Providers</h2>
                <p className="text-sm text-zinc-400">
                    Configure your LLM providers.
                    {isProduction
                        ? ' API keys are configured on the server for security.'
                        : ' Keys are stored locally in your browser.'}
                </p>
            </div>

            {/* System AI Section */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-zinc-300">
                    <Cpu className="w-4 h-4" />
                    <span className="text-sm font-medium">System AI</span>
                </div>
                <SystemAiCard providers={providers} />
            </div>

            {/* Provider Cards */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-zinc-300">LLM Providers</h3>
                <div className="grid gap-4">
                    {providers.map((provider) => {
                        const providerId = provider.id as keyof typeof providerConfigs;
                        const config = providerConfigs[providerId];

                        // A provider the client does not know how to configure
                        // is left out rather than rendered with undefined state.
                        if (!config) return null;

                        return (
                            <ProviderCard
                                key={provider.id}
                                provider={provider}
                                config={config}
                                isDefault={defaultProvider === providerId}
                                isProduction={isProduction}
                                onConfigChange={(updates) => setProviderConfig(providerId, updates)}
                                onSetDefault={() => setDefaultProvider(providerId)}
                            />
                        );
                    })}
                </div>
            </div>

            <div className="bg-zinc-800/50 rounded-lg p-4 text-sm text-zinc-400">
                <p className="font-medium text-zinc-300 mb-1">🔒 Security Note</p>
                <p>
                    {isProduction
                        ? 'API keys are stored securely on the server and never exposed to the browser.'
                        : "API keys are stored in your browser's local storage and only transmitted directly to the respective LLM provider APIs."}
                </p>
            </div>
        </div>
    );
}
