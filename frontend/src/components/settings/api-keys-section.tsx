'use client';

import { useEffect, useState } from 'react';
import { Loader2, Cpu } from 'lucide-react';
import { ProviderCard } from './provider-card';
import { SystemAICard } from './system-ai-card';
import { settingsApi, ProviderInfo } from '@/lib/api';
import { useSettingsStore } from '@/stores/settings-store';

export function ApiKeysSection() {
    const [providers, setProviders] = useState<ProviderInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const {
        providers: providerConfigs,
        defaultProvider,
        isProduction,
        setProviderConfig,
        setDefaultProvider,
        initializeFromServer,
    } = useSettingsStore();

    useEffect(() => {
        loadProviders();
    }, []);

    const loadProviders = async () => {
        try {
            const response = await settingsApi.getProviders();
            setProviders(response.providers);

            // Initialize settings from server on first load
            initializeFromServer({
                isProduction: response.environment.is_production,
                configuredProviders: response.environment.configured_providers,
                defaultProvider: response.environment.default_provider,
                defaultModels: response.environment.default_models,
                systemAI: {
                    provider: response.system_ai.provider,
                    model: response.system_ai.model,
                    temperature: response.system_ai.temperature,
                    maxTokens: response.system_ai.max_tokens,
                },
            });
        } catch (err) {
            setError('Failed to load providers');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <p className="text-red-400">{error}</p>
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
                <SystemAICard providers={providers} />
            </div>

            {/* Provider Cards */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-zinc-300">LLM Providers</h3>
                <div className="grid gap-4">
                    {providers.map((provider) => {
                        const providerId = provider.id as keyof typeof providerConfigs;
                        const config = providerConfigs[providerId];

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
                        : 'API keys are stored in your browser\'s local storage and only transmitted directly to the respective LLM provider APIs.'}
                </p>
            </div>
        </div>
    );
}
