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
        saveStatus,
        saveError,
        effective,
        effectiveReadiness,
        setProviderConfig,
        setDefaultProvider,
        initializeFromServer,
        loadFromServer,
    } = useSettingsStore();

    useEffect(() => {
        loadProviders();
    }, []);

    const loadProviders = async () => {
        try {
            const response = await settingsApi.getProviders();
            setProviders(response.providers);

            // Initialize settings from server on first load, then hydrate
            // authoritative non-secret preferences (server owns secrets).
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
            await loadFromServer();
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
                <h2 className="text-lg font-semibold text-white">Providers & Inference</h2>
                <p className="text-sm text-zinc-400">
                    Non-secret preferences persist on the server. API keys and
                    destinations stay server-managed and never live in this browser.
                </p>
            </div>

            {/* Save status: server-authoritative feedback, never optimistic. */}
            <div
                aria-live="polite"
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm"
            >
                {saveStatus === 'saving' && (
                    <p className="text-zinc-300">Saving preferences to the server…</p>
                )}
                {saveStatus === 'saved' && (
                    <p className="text-green-400">Preferences saved. Values below are the server-effective configuration.</p>
                )}
                {saveStatus === 'failed' && (
                    <p role="alert" className="text-red-400">
                        Save failed{saveError ? `: ${saveError}` : ''}. The values below are the last confirmed server state, not your unsaved edits.
                    </p>
                )}
                {saveStatus === 'idle' && (
                    <p className="text-zinc-400">Values below are the last confirmed server-effective configuration.</p>
                )}
                {effective ? (
                    <dl className="mt-2 grid gap-1 text-xs text-zinc-400">
                        <div className="flex gap-2">
                            <dt className="shrink-0 text-zinc-500">Effective provider:</dt>
                            <dd className="text-zinc-200">{effective.provider || '—'}</dd>
                        </div>
                        <div className="flex gap-2">
                            <dt className="shrink-0 text-zinc-500">Effective model:</dt>
                            <dd className="text-zinc-200">{effective.model || '—'}</dd>
                        </div>
                        <div className="flex gap-2">
                            <dt className="shrink-0 text-zinc-500">Temperature / max tokens:</dt>
                            <dd className="text-zinc-200">
                                {effective.temperature} / {effective.max_tokens}
                            </dd>
                        </div>
                        {effectiveReadiness && !effectiveReadiness.ready && (
                            <p role="status" className="text-amber-400">
                                Not ready: {effectiveReadiness.reason}
                            </p>
                        )}
                    </dl>
                ) : (
                    <p className="mt-2 text-xs text-zinc-500">
                        Effective configuration unavailable — the server could not be reached or rejected the last save.
                    </p>
                )}
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
                    API keys are stored securely on the server and never exposed to the browser.
                    This panel only edits non-secret defaults; readiness is reported without revealing secrets.
                </p>
            </div>
        </div>
    );
}
