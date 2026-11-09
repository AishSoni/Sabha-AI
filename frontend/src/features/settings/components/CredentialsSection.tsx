'use client';

/**
 * Credentials section (spec-37, spec-38).
 *
 * Vault behavior is unchanged: the passphrase is transient input, sealed
 * envelopes persist, and signing in never unlocks the vault.
 */
import { VaultCard } from './VaultCard';
import { useSettingsStore } from '../state/settings-store';

export function CredentialsSection() {
    const isProduction = useSettingsStore((state) => state.isProduction);

    return (
        <section aria-labelledby="settings-credentials-title" className="space-y-6">
            <div className="space-y-1">
                <h2 id="settings-credentials-title" className="type-section-title">
                    Credentials
                </h2>
                <p className="type-body text-ink-secondary">
                    Keep browser-held provider keys in a passphrase-protected vault. Server
                    credentials are never shown here.
                </p>
            </div>

            <VaultCard />

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
        </section>
    );
}
