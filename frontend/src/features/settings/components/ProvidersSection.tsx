'use client';

/**
 * Provider section of the settings screen (spec-10, spec-38).
 *
 * Providers remain editable: server metadata describes the available provider
 * catalogue, while model/default choices and browser keys live in the local
 * store/vault.
 */
import { SettingsMetadata } from './SettingsMetadata';
import { ProviderCard } from './ProviderCard';
import { useSettingsStore, type ProviderId } from '../state/settings-store';

export function ProvidersSection() {
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
    } = useSettingsStore();

    return (
        <section aria-labelledby="settings-providers-title" className="space-y-6">
            <div className="space-y-1">
                <h2 id="settings-providers-title" className="type-section-title">
                    Providers
                </h2>
                <p className="type-body text-ink-secondary">
                    Choose the models Sabha may use. Browser keys are encrypted locally;
                    server keys stay on the server.
                </p>
            </div>

            <SettingsMetadata>
                {(metadata) => (
                    <div className="grid gap-4">
                        {metadata.providers.map((provider) => {
                            const providerId = provider.id as ProviderId;
                            const config = providerConfigs[providerId];

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
                                    onConfigChange={(updates) =>
                                        setProviderConfig(providerId, updates)
                                    }
                                    onSaveKey={(key) => saveProviderKey(providerId, key)}
                                    onRemoveKey={() => removeProviderKey(providerId)}
                                    onResolveStoredKey={() => getProviderApiKey(providerId)}
                                    onSetDefault={() => setDefaultProvider(providerId)}
                                />
                            );
                        })}
                    </div>
                )}
            </SettingsMetadata>
        </section>
    );
}
