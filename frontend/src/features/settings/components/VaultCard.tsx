'use client';

/**
 * Browser key vault controls (spec-37).
 *
 * The vault is a separate capability from login: signing in never unlocks it,
 * reload starts locked, and access loss locks it. Passphrases are transient
 * component input only; the store persists sealed envelopes and the salt.
 */
import { useState } from 'react';
import { KeyRound, Lock, LockOpen, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSettingsStore } from '../state/settings-store';

const MIN_PASSPHRASE_LENGTH = 8;

export function VaultCard() {
    const vaultUnlocked = useSettingsStore((state) => state.vaultUnlocked);
    const vaultSalt = useSettingsStore((state) => state.vaultSalt);
    const vaultCiphertexts = useSettingsStore((state) => state.vaultCiphertexts);
    const vaultError = useSettingsStore((state) => state.vaultError);
    const createVault = useSettingsStore((state) => state.createVault);
    const unlockVault = useSettingsStore((state) => state.unlockVault);
    const lockVault = useSettingsStore((state) => state.lockVault);
    const changeVaultPassphrase = useSettingsStore((state) => state.changeVaultPassphrase);

    const [passphrase, setPassphrase] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [newPassphrase, setNewPassphrase] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [showChange, setShowChange] = useState(false);

    const hasVault = vaultSalt !== null || Object.keys(vaultCiphertexts).length > 0;
    const storedCount = Object.keys(vaultCiphertexts).length;

    const [wasUnlocked, setWasUnlocked] = useState(vaultUnlocked);
    if (wasUnlocked !== vaultUnlocked) {
        setWasUnlocked(vaultUnlocked);
        if (!vaultUnlocked) {
            setPassphrase('');
            setConfirmation('');
            setNewPassphrase('');
            setShowChange(false);
        }
    }

    const validateNewPassphrase = (): boolean => {
        if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
            setNotice(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
            return false;
        }
        if (passphrase !== confirmation) {
            setNotice('The passphrases do not match.');
            return false;
        }
        return true;
    };

    const handleCreate = async () => {
        setNotice(null);
        if (!validateNewPassphrase()) return;

        setBusy(true);
        const created = await createVault(passphrase);
        setBusy(false);
        setPassphrase('');
        setConfirmation('');
        if (created) {
            setNotice('Key vault created and unlocked.');
        }
    };

    const handleUnlock = async () => {
        setNotice(null);
        if (!passphrase) {
            setNotice('Enter your vault passphrase.');
            return;
        }

        setBusy(true);
        const unlocked = await unlockVault(passphrase);
        setBusy(false);
        setPassphrase('');
        if (unlocked) {
            setNotice('Key vault unlocked for this tab.');
        }
    };

    const handleLock = () => {
        lockVault();
        setNotice('Key vault locked. Stored keys stay encrypted.');
    };

    const handleChange = async () => {
        setNotice(null);
        if (newPassphrase.length < MIN_PASSPHRASE_LENGTH) {
            setNotice(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
            return;
        }
        if (newPassphrase !== confirmation) {
            setNotice('The passphrases do not match.');
            return;
        }

        setBusy(true);
        const changed = await changeVaultPassphrase(newPassphrase);
        setBusy(false);
        setNewPassphrase('');
        setConfirmation('');
        setShowChange(false);
        if (changed) {
            setNotice('Vault passphrase changed. Stored keys were re-encrypted.');
        }
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-control bg-action/10 text-action">
                        {vaultUnlocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                    </span>
                    <div>
                        <CardTitle>Key Vault</CardTitle>
                        <p className="text-xs text-ink-secondary">
                            Encrypted browser storage. Login and vault unlock are separate.
                        </p>
                    </div>
                    <span className="ml-auto">
                        {vaultUnlocked ? (
                            <span className="flex items-center gap-1 type-meta text-success">
                                <ShieldCheck className="size-3.5" /> Unlocked
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 type-meta text-ink-muted">
                                <Lock className="size-3.5" /> Locked
                            </span>
                        )}
                    </span>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {vaultError && (
                    <p role="alert" className="rounded-control border border-danger/40 bg-danger-soft px-3 py-2 type-meta text-danger">
                        {vaultError}
                    </p>
                )}
                {notice && (
                    <p role="status" className="type-meta text-ink-secondary">
                        {notice}
                    </p>
                )}

                {!hasVault ? (
                    <div className="space-y-3">
                        <p className="type-body text-ink-secondary">
                            Create a passphrase to encrypt provider keys in this browser. It is never
                            sent to the server or stored anywhere.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="vault-passphrase">Passphrase</Label>
                                <Input
                                    id="vault-passphrase"
                                    type="password"
                                    autoComplete="new-password"
                                    value={passphrase}
                                    onChange={(event) => setPassphrase(event.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="vault-confirmation">Confirm passphrase</Label>
                                <Input
                                    id="vault-confirmation"
                                    type="password"
                                    autoComplete="new-password"
                                    value={confirmation}
                                    onChange={(event) => setConfirmation(event.target.value)}
                                />
                            </div>
                        </div>
                        <Button onClick={() => void handleCreate()} busy={busy} busyLabel="Creating">
                            <KeyRound className="mr-2 size-4" />
                            Create vault
                        </Button>
                    </div>
                ) : vaultUnlocked ? (
                    <div className="space-y-3">
                        <p className="type-body text-ink-secondary">
                            {storedCount === 1
                                ? '1 stored provider key is available to this tab.'
                                : `${storedCount} stored provider keys are available to this tab.`}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={handleLock}>
                                <Lock className="mr-2 size-4" />
                                Lock vault
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setShowChange((value) => !value);
                                    setNotice(null);
                                }}
                            >
                                Change passphrase
                            </Button>
                        </div>

                        {showChange && (
                            <div className="grid gap-3 rounded-control border border-separator p-3 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="vault-new-passphrase">New passphrase</Label>
                                    <Input
                                        id="vault-new-passphrase"
                                        type="password"
                                        autoComplete="new-password"
                                        value={newPassphrase}
                                        onChange={(event) => setNewPassphrase(event.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="vault-new-confirmation">Confirm new passphrase</Label>
                                    <Input
                                        id="vault-new-confirmation"
                                        type="password"
                                        autoComplete="new-password"
                                        value={confirmation}
                                        onChange={(event) => setConfirmation(event.target.value)}
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <Button onClick={() => void handleChange()} busy={busy} busyLabel="Changing">
                                        Re-encrypt stored keys
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="type-body text-ink-secondary">
                            {storedCount === 0
                                ? 'This vault is locked.'
                                : `Unlock to use ${storedCount === 1 ? '1 stored provider key' : `${storedCount} stored provider keys`}.`}
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                            <div className="flex-1 space-y-2">
                                <Label htmlFor="vault-unlock-passphrase">Passphrase</Label>
                                <Input
                                    id="vault-unlock-passphrase"
                                    type="password"
                                    autoComplete="current-password"
                                    value={passphrase}
                                    onChange={(event) => setPassphrase(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') void handleUnlock();
                                    }}
                                />
                            </div>
                            <Button onClick={() => void handleUnlock()} busy={busy} busyLabel="Unlocking">
                                <LockOpen className="mr-2 size-4" />
                                Unlock vault
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
