"use client";

import { useState } from "react";
import { KeyRound, Lock, Unlock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "../state/settings-store";

export function VaultSection() {
    const vaultUnlocked = useSettingsStore((state) => state.vaultUnlocked);
    const vaultError = useSettingsStore((state) => state.vaultError);
    const vaultSalt = useSettingsStore((state) => state.vaultSalt);
    const vaultCiphertexts = useSettingsStore(
        (state) => state.vaultCiphertexts
    );
    const unlockVault = useSettingsStore((state) => state.unlockVault);
    const lockVault = useSettingsStore((state) => state.lockVault);
    const changeVaultPassphrase = useSettingsStore(
        (state) => state.changeVaultPassphrase
    );
    const [passphrase, setPassphrase] = useState("");
    const [currentPassphrase, setCurrentPassphrase] = useState("");
    const [nextPassphrase, setNextPassphrase] = useState("");
    const [confirmPassphrase, setConfirmPassphrase] = useState("");
    const [busy, setBusy] = useState(false);
    const [announcement, setAnnouncement] = useState("");
    const [formError, setFormError] = useState<string | null>(null);
    const sealedCount = Object.keys(vaultCiphertexts).length;

    const unlock = async () => {
        setFormError(null);
        setBusy(true);
        try {
            const ok = await unlockVault(passphrase);
            if (ok) {
                setPassphrase("");
                setAnnouncement("Provider credential vault unlocked.");
            }
        } finally {
            setBusy(false);
        }
    };

    const changePassphrase = async () => {
        setFormError(null);
        if (nextPassphrase.length < 8) {
            setFormError("Use at least eight characters for the new passphrase.");
            return;
        }
        if (nextPassphrase !== confirmPassphrase) {
            setFormError("The new passphrase and confirmation do not match.");
            return;
        }
        setBusy(true);
        try {
            const ok = await changeVaultPassphrase(
                currentPassphrase,
                nextPassphrase
            );
            if (ok) {
                setCurrentPassphrase("");
                setNextPassphrase("");
                setConfirmPassphrase("");
                setAnnouncement("Vault passphrase changed and sealed keys re-encrypted.");
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <section
            aria-labelledby="vault-heading"
            className="material-raised rounded-group border border-separator p-5"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <KeyRound
                            aria-hidden="true"
                            className="size-4 text-ink-muted"
                        />
                        <h2
                            id="vault-heading"
                            className="type-section-title text-ink"
                        >
                            Provider credential vault
                        </h2>
                        <Badge variant="outline">
                            {vaultUnlocked ? "Unlocked" : "Locked"}
                        </Badge>
                    </div>
                    <p className="mt-1 max-w-[68ch] type-body text-ink-secondary">
                        API keys are sealed in this browser. The passphrase,
                        derived key, and plaintext are memory-only and vanish
                        when you lock the vault or refresh the page.
                    </p>
                    <p className="mt-1 type-meta text-ink-muted">
                        {sealedCount} sealed provider key
                        {sealedCount === 1 ? "" : "s"}
                        {vaultSalt ? " · vault passphrase set" : ""}
                    </p>
                </div>
                {vaultUnlocked ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            lockVault();
                            setAnnouncement("Provider credential vault locked.");
                        }}
                    >
                        <Lock aria-hidden="true" />
                        Lock vault
                    </Button>
                ) : null}
            </div>

            <p aria-live="polite" className="mt-3 min-h-4 type-meta text-success">
                {announcement}
            </p>
            {vaultError || formError ? (
                <p role="alert" className="mt-2 type-body text-danger">
                    {formError ?? vaultError}
                </p>
            ) : null}

            {!vaultUnlocked ? (
                <form
                    className="mt-4 flex max-w-md flex-col gap-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void unlock();
                    }}
                >
                    <label
                        htmlFor="vault-unlock-passphrase"
                        className="type-control text-ink"
                    >
                        Vault passphrase
                    </label>
                    <Input
                        id="vault-unlock-passphrase"
                        type="password"
                        autoComplete="current-password"
                        value={passphrase}
                        onChange={(event) => setPassphrase(event.target.value)}
                    />
                    <Button
                        type="submit"
                        busy={busy}
                        busyLabel="Unlocking"
                        disabled={!passphrase}
                        className="self-start"
                    >
                        <Unlock aria-hidden="true" />
                        Unlock vault
                    </Button>
                </form>
            ) : (
                <details className="mt-4">
                    <summary className="m-control cursor-pointer type-control text-ink">
                        Change vault passphrase
                    </summary>
                    <form
                        className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void changePassphrase();
                        }}
                    >
                        <label className="flex flex-col gap-1 sm:col-span-2">
                            <span className="type-control text-ink">
                                Current passphrase
                            </span>
                            <Input
                                type="password"
                                autoComplete="current-password"
                                value={currentPassphrase}
                                onChange={(event) =>
                                    setCurrentPassphrase(event.target.value)
                                }
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="type-control text-ink">
                                New passphrase
                            </span>
                            <Input
                                type="password"
                                autoComplete="new-password"
                                value={nextPassphrase}
                                onChange={(event) =>
                                    setNextPassphrase(event.target.value)
                                }
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="type-control text-ink">
                                Confirm new passphrase
                            </span>
                            <Input
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassphrase}
                                onChange={(event) =>
                                    setConfirmPassphrase(event.target.value)
                                }
                            />
                        </label>
                        <Button
                            type="submit"
                            busy={busy}
                            busyLabel="Re-encrypting"
                            disabled={
                                !currentPassphrase ||
                                !nextPassphrase ||
                                !confirmPassphrase
                            }
                            className="self-start sm:col-span-2"
                        >
                            Change passphrase
                        </Button>
                    </form>
                </details>
            )}
        </section>
    );
}
