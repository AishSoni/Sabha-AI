'use client';

/**
 * Vault-aware closing panel (spec-37).
 *
 * Only the live runtime supplies this wrapper. It resolves browser keys at
 * command time; the shared panel never imports the settings store or vault.
 */
import { useSettingsStore } from '@/features/settings';
import { ClosingPanel, type ClosingPanelProps } from '../components/ClosingPanel';

export function LiveClosingPanel(props: ClosingPanelProps) {
    const vaultUnlocked = useSettingsStore((state) => state.vaultUnlocked);
    const vaultCiphertexts = useSettingsStore((state) => state.vaultCiphertexts);
    const getProviderApiKey = useSettingsStore((state) => state.getProviderApiKey);

    return (
        <ClosingPanel
            {...props}
            credentials={{
                status: (provider) => ({
                    stored: vaultCiphertexts[provider] !== undefined,
                    unlocked: vaultUnlocked,
                }),
                resolve: (providers) => {
                    const keys: Record<string, string> = {};
                    for (const provider of providers) {
                        const key = getProviderApiKey(provider);
                        if (key) keys[provider] = key;
                    }
                    return keys;
                },
            }}
        />
    );
}
