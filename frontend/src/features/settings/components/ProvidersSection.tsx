'use client';

/**
 * Provider section of the settings screen (spec-10, spec-38).
 *
 * Providers remain editable: server metadata describes the available provider
 * catalogue, while model/default choices and browser keys live in the local
 * store/vault.
 */
import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SettingsMetadata } from './SettingsMetadata';
import { ProviderCard } from './ProviderCard';
import {
    PROVIDER_IDS,
    useSettingsStore,
    type ProviderConfig,
    type ProviderId,
} from '../state/settings-store';

function UnsupportedProviderCard({
    providerId,
    config,
    onRemove,
}: {
    providerId: string;
    config?: ProviderConfig;
    onRemove: () => void;
}) {
    return (
        <Card className="border-warning/40">
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{providerId}</CardTitle>
                    <Badge variant="warning">Unsupported</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="type-body text-ink-secondary">
                    {config
                        ? 'This saved browser configuration uses a provider this Sabha build does not support. It is kept for reference but cannot be tested, enabled, or used for generation.'
                        : 'The server reports a provider this Sabha build does not support. It cannot be tested, enabled, or used for generation.'}
                </p>
                {config?.model && (
                    <p className="type-meta text-ink-secondary">
                        Saved model: <span className="font-mono">{config.model}</span>
                    </p>
                )}
                {config && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onRemove}
                    >
                        <Trash2 className="size-4" aria-hidden="true" />
                        Remove saved configuration
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}

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
        clearProviderConfig,
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
                {(metadata) => {
                    const supportedProviders = new Set<string>(PROVIDER_IDS);
                    const unsupportedIds = Array.from(
                        new Set([
                            ...metadata.providers.map((provider) => provider.id),
                            ...Object.keys(providerConfigs),
                        ])
                    ).filter((providerId) => !supportedProviders.has(providerId));
                    return (
                        <div className="grid gap-4">
                            {metadata.providers.map((provider) => {
                                if (!supportedProviders.has(provider.id)) {
                                    return null;
                                }
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
                                        storedKey={
                                            vaultCiphertexts[providerId] !== undefined
                                        }
                                        vaultUnlocked={vaultUnlocked}
                                        vaultEpoch={vaultEpoch}
                                        onConfigChange={(updates) =>
                                            setProviderConfig(providerId, updates)
                                        }
                                        onSaveKey={(key) =>
                                            saveProviderKey(providerId, key)
                                        }
                                        onRemoveKey={() =>
                                            removeProviderKey(providerId)
                                        }
                                        onResolveStoredKey={() =>
                                            getProviderApiKey(providerId)
                                        }
                                        onSetDefault={() =>
                                            setDefaultProvider(providerId)
                                        }
                                    />
                                );
                            })}
                            {unsupportedIds.map((providerId) => (
                                <UnsupportedProviderCard
                                    key={providerId}
                                    providerId={providerId}
                                    config={
                                        (
                                            providerConfigs as Record<
                                                string,
                                                ProviderConfig
                                            >
                                        )[providerId]
                                    }
                                    onRemove={() =>
                                        clearProviderConfig(providerId)
                                    }
                                />
                            ))}
                        </div>
                    );
                }}
            </SettingsMetadata>
        </section>
    );
}
