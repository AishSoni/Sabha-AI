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
import { Button } from '@/components/ui/button';
import { ProviderCard } from './ProviderCard';
import { SystemAiCard } from './SystemAiCard';
import { VaultCard } from './VaultCard';
import { useProvidersEnvironment } from '../api';
import { useSettingsStore, type ProviderId } from '../state/settings-store';

export function ApiKeysSection() {
    // Server-owned metadata read — TanStack Query owns this fetch; the
    // settings store keeps only the user's local choices.
    const providersQuery = useProvidersEnvironment();
    const providers = providersQuery.data?.providers ?? [];

    const {
        providers: providerConfigs,
        defaultProvider,
        isProduction,
        vaultUnlocked,
        vaultEpoch,
        vaultCiphertexts,
        setProviderConfig,
        setDefaultProvider,
        saveProviderKey,
        removeProviderKey,
        getProviderApiKey,
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
        });
    }, [metadata, initializeFromServer]);

    if (providersQuery.isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-ink-muted motion-reduce:animate-none" />
            </div>
        );
    }

    if (providersQuery.error) {
        return (
            <div role="alert" className="rounded-group border border-danger/40 bg-danger-soft p-4">
                <p className="type-body text-danger">Failed to load providers</p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void providersQuery.refetch()}
                    className="mt-3"
                >
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h2 className="type-section-title">API Keys & Providers</h2>
                <p className="type-body text-ink-secondary">
                    Configure your LLM providers. Browser keys are encrypted locally; server keys
                    stay on the server.
                </p>
            </div>

            <VaultCard />

            {/* System AI Section */}
            {metadata && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-ink">
                        <Cpu className="size-4" />
                        <span className="type-control font-medium">System AI</span>
                    </div>
                    <SystemAiCard
                        providers={providers}
                        systemAI={metadata.systemAI}
                        defaultProvider={metadata.environment.defaultProvider}
                    />
                </div>
            )}

            {/* Provider Cards */}
            <div className="space-y-3">
                <h3 className="type-item-title">LLM Providers</h3>
                <div className="grid gap-4">
                    {providers.map((provider) => {
                        const providerId = provider.id as ProviderId;
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
                                storedKey={vaultCiphertexts[providerId] !== undefined}
                                vaultUnlocked={vaultUnlocked}
                                vaultEpoch={vaultEpoch}
                                onConfigChange={(updates) => setProviderConfig(providerId, updates)}
                                onSaveKey={(key) => saveProviderKey(providerId, key)}
                                onRemoveKey={() => removeProviderKey(providerId)}
                                onResolveStoredKey={() => getProviderApiKey(providerId)}
                                onSetDefault={() => setDefaultProvider(providerId)}
                            />
                        );
                    })}
                </div>
            </div>

            <div className="rounded-group bg-surface-raised p-4 type-body text-ink-secondary">
                <p className="mb-1 font-medium text-ink">🔒 Security Note</p>
                <p>
                    {isProduction
                        ? 'Server infrastructure keys are stored on the server and never sent to the browser. '
                        : ''}
                    Browser keys are encrypted in this browser’s local storage, decrypted only while
                    the vault is unlocked for this tab, and may be forwarded over HTTPS to the Sabha
                    backend for provider operations such as model discovery, key tests, meeting
                    turns, votes, and summaries. They are not sent only to the provider directly.
                    Login does not unlock the vault.
                </p>
            </div>
        </div>
    );
}
