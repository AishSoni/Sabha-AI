'use client';

/**
 * Provider configuration card (spec-10, spec-37).
 *
 * Local choices (enabled, model, temperature, max tokens) belong to the
 * settings store. Provider credentials are different: the key input is a
 * transient draft, stored presence is a sealed ciphertext, and every explicit
 * command (save, test, discovery) resolves a credential at call time. Secrets
 * never enter query state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Check, X, Loader2, Zap, RefreshCw, KeyRound, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useFetchProviderModels, useTestProviderKey } from '../api';
import type { FetchedModelInfoView, ProviderInfoView } from '../api';
import type { ProviderConfig, ProviderKeySaveResult } from '../state/settings-store';

interface ProviderCardProps {
    provider: ProviderInfoView;
    config: ProviderConfig;
    isDefault: boolean;
    isProduction?: boolean;
    storedKey: boolean;
    vaultUnlocked: boolean;
    vaultEpoch: number;
    onConfigChange: (config: Partial<ProviderConfig>) => void;
    onSaveKey: (key: string) => Promise<ProviderKeySaveResult>;
    onRemoveKey: () => void;
    onResolveStoredKey: () => string | undefined;
    onSetDefault: () => void;
}

type KeyNotice = { tone: 'success' | 'error'; message: string };

export function ProviderCard({
    provider,
    config,
    isDefault,
    isProduction,
    storedKey,
    vaultUnlocked,
    vaultEpoch,
    onConfigChange,
    onSaveKey,
    onRemoveKey,
    onResolveStoredKey,
    onSetDefault,
}: ProviderCardProps) {
    const [showKey, setShowKey] = useState(false);
    const [keyDraft, setKeyDraft] = useState('');
    const [savingKey, setSavingKey] = useState(false);
    const [keyNotice, setKeyNotice] = useState<KeyNotice | null>(null);
    const [testOutcome, setTestOutcome] = useState<{
        valid: boolean;
        message: string;
        epoch: number;
        generation: number;
    } | null>(null);
    const [modelsState, setModelsState] = useState<{
        models: FetchedModelInfoView[];
        error: string | null;
        epoch: number;
        generation: number;
    } | null>(null);

    const {
        mutateAsync: fetchModelsRequest,
        isPending: loadingModels,
    } = useFetchProviderModels();
    const { mutateAsync: testKeyRequest, isPending: testing } = useTestProviderKey();

    // The mount effect must not refetch when a parent re-render creates a new
    // callback; read the latest card inputs at call time instead.
    const latest = useRef({
        provider,
        config,
        keyDraft,
        storedKey,
        vaultUnlocked,
        vaultEpoch,
        onConfigChange,
        onResolveStoredKey,
    });
    useEffect(() => {
        latest.current = {
            provider,
            config,
            keyDraft,
            storedKey,
            vaultUnlocked,
            vaultEpoch,
            onConfigChange,
            onResolveStoredKey,
        };
    }, [
        provider,
        config,
        keyDraft,
        storedKey,
        vaultUnlocked,
        vaultEpoch,
        onConfigChange,
        onResolveStoredKey,
    ]);

    const testToken = useRef(0);
    const discoveryToken = useRef(0);
    const inputGeneration = useRef(0);
    const [generation, setGeneration] = useState(0);

    /**
     * Invalidate every in-flight command and every result that was produced for
     * an earlier credential or endpoint. The generation is a monotonic number:
     * raw key material never enters an identity, cache key or fingerprint.
     */
    const invalidateInputs = useCallback(() => {
        inputGeneration.current += 1;
        testToken.current += 1;
        discoveryToken.current += 1;
        setGeneration(inputGeneration.current);
        setTestOutcome(null);
        setModelsState(null);
    }, []);

    // Inputs owned outside the draft (provider identity, endpoint, stored-key
    // presence, vault state and server-key availability) invalidate results too.
    const externalInputs = useRef({
        providerId: provider.id,
        baseUrl: config.baseUrl ?? '',
        serverConfigured: Boolean(config.serverConfigured),
        storedKey,
        vaultUnlocked,
        vaultEpoch,
    });
    useEffect(() => {
        const next = {
            providerId: provider.id,
            baseUrl: config.baseUrl ?? '',
            serverConfigured: Boolean(config.serverConfigured),
            storedKey,
            vaultUnlocked,
            vaultEpoch,
        };
        const previous = externalInputs.current;
        externalInputs.current = next;
        if (
            previous.providerId !== next.providerId ||
            previous.baseUrl !== next.baseUrl ||
            previous.serverConfigured !== next.serverConfigured ||
            previous.storedKey !== next.storedKey ||
            previous.vaultUnlocked !== next.vaultUnlocked ||
            previous.vaultEpoch !== next.vaultEpoch
        ) {
            invalidateInputs();
        }
    }, [
        provider.id,
        config.baseUrl,
        config.serverConfigured,
        storedKey,
        vaultUnlocked,
        vaultEpoch,
        invalidateInputs,
    ]);

    // Adjust state during render when the vault locks (the documented pattern
    // for derived state), so a typed draft never survives an access-loss lock
    // without an effect-induced cascading render.
    const [wasUnlocked, setWasUnlocked] = useState(vaultUnlocked);
    if (wasUnlocked !== vaultUnlocked) {
        setWasUnlocked(vaultUnlocked);
        if (!vaultUnlocked) {
            setKeyDraft('');
            setShowKey(false);
        }
    }

    const resolveCredential = useCallback((): { key?: string; blocked?: string } => {
        const current = latest.current;
        const draft = current.keyDraft.trim();
        if (draft) return { key: draft };

        if (current.storedKey) {
            if (!current.vaultUnlocked) {
                return { blocked: 'Unlock the key vault above to use the stored key.' };
            }
            const stored = current.onResolveStoredKey();
            if (stored) return { key: stored };
            return {
                blocked: 'The stored key is unavailable. Unlock the key vault and try again.',
            };
        }

        return {};
    }, []);

    const fetchModels = useCallback(async () => {
        const current = latest.current;
        const epoch = current.vaultEpoch;
        const requestGeneration = inputGeneration.current;
        const token = ++discoveryToken.current;
        const modelWasEmpty = !current.config.model;
        const credential = resolveCredential();

        if (credential.blocked) {
            setModelsState({
                models: [],
                error: credential.blocked,
                epoch,
                generation: requestGeneration,
            });
            return;
        }

        if (
            current.provider.requires_api_key &&
            !current.config.serverConfigured &&
            !credential.key
        ) {
            setModelsState({
                models: [],
                error: 'Save an API key to load models.',
                epoch,
                generation: requestGeneration,
            });
            return;
        }

        try {
            const result = await fetchModelsRequest({
                provider: current.provider.id,
                apiKey: credential.key,
                baseUrl: current.config.baseUrl || undefined,
            });
            const now = latest.current;
            if (
                token !== discoveryToken.current ||
                requestGeneration !== inputGeneration.current ||
                now.vaultEpoch !== epoch ||
                now.provider.id !== current.provider.id
            ) {
                return;
            }

            if (!result.success) {
                setModelsState({
                    models: [],
                    error: result.message || 'Failed to fetch models',
                    epoch,
                    generation: requestGeneration,
                });
                return;
            }

            setModelsState({
                models: result.models,
                error: null,
                epoch,
                generation: requestGeneration,
            });
            if (modelWasEmpty && !now.config.model && result.models.length > 0) {
                now.onConfigChange({ model: result.models[0]!.id });
            }
        } catch {
            const now = latest.current;
            if (
                token !== discoveryToken.current ||
                requestGeneration !== inputGeneration.current ||
                now.vaultEpoch !== epoch ||
                now.provider.id !== current.provider.id
            ) {
                return;
            }
            setModelsState({
                models: [],
                error: 'Failed to fetch models',
                epoch,
                generation: requestGeneration,
            });
        }
    }, [fetchModelsRequest, resolveCredential]);

    // Fetch models on mount if provider is enabled/configured, and again after
    // an unlock makes a stored key usable.
    useEffect(() => {
        if (config.enabled || config.serverConfigured || provider.id === 'ollama') {
            void fetchModels();
        }
    }, [
        config.enabled,
        config.serverConfigured,
        provider.id,
        vaultUnlocked,
        vaultEpoch,
        fetchModels,
    ]);

    const handleSaveKey = async () => {
        const key = keyDraft.trim();
        setKeyNotice(null);
        if (!key) {
            setKeyNotice({ tone: 'error', message: 'Enter an API key before saving.' });
            return;
        }
        if (!vaultUnlocked) {
            setKeyNotice({
                tone: 'error',
                message: 'Unlock or create the key vault above before saving this key.',
            });
            return;
        }

        setSavingKey(true);
        const result = await onSaveKey(key);
        setSavingKey(false);
        if (!result.ok) {
            setKeyNotice({ tone: 'error', message: result.error ?? 'The key was not saved.' });
            return;
        }

        setKeyDraft('');
        setKeyNotice({ tone: 'success', message: 'Key saved encrypted in this browser.' });
        // The vault epoch changes when the sealed key is saved; the auto-fetch
        // effect then reloads models with the new stored credential.
    };

    const handleRemoveKey = () => {
        invalidateInputs();
        onRemoveKey();
        setKeyDraft('');
        setKeyNotice({ tone: 'success', message: 'Stored key removed.' });
    };

    const handleTestConnection = async () => {
        const current = latest.current;
        const token = ++testToken.current;
        const epoch = current.vaultEpoch;
        const requestGeneration = inputGeneration.current;
        const credential = resolveCredential();

        if (credential.blocked) {
            setTestOutcome({
                valid: false,
                message: credential.blocked,
                epoch,
                generation: requestGeneration,
            });
            return;
        }
        if (
            current.provider.requires_api_key &&
            !current.config.serverConfigured &&
            !credential.key
        ) {
            setTestOutcome({
                valid: false,
                message: 'Enter or save an API key before testing.',
                epoch,
                generation: requestGeneration,
            });
            return;
        }

        try {
            const result = await testKeyRequest({
                provider: current.provider.id,
                apiKey: credential.key,
                baseUrl: current.config.baseUrl || undefined,
            });
            const now = latest.current;
            if (
                token !== testToken.current ||
                requestGeneration !== inputGeneration.current ||
                now.vaultEpoch !== epoch ||
                now.provider.id !== current.provider.id
            ) {
                return;
            }

            setTestOutcome({
                valid: result.valid,
                message: result.message,
                epoch,
                generation: requestGeneration,
            });
            if (result.valid) {
                now.onConfigChange({ enabled: true });
                // A newly enabled provider refetches through the auto-fetch
                // effect; an already-enabled card refreshes immediately.
                if (current.config.enabled) void fetchModels();
            }
        } catch {
            const now = latest.current;
            if (
                token !== testToken.current ||
                requestGeneration !== inputGeneration.current ||
                now.vaultEpoch !== epoch ||
                now.provider.id !== current.provider.id
            ) {
                return;
            }
            setTestOutcome({
                valid: false,
                message: 'Connection failed. Check the key and provider settings.',
                epoch,
                generation: requestGeneration,
            });
        }
    };

    const getProviderIcon = () => {
        switch (provider.id) {
            case 'openrouter':
                return '🔀';
            case 'gemini':
                return '✨';
            case 'ollama':
                return '🦙';
            default:
                return '🤖';
        }
    };

    const models =
        modelsState?.epoch === vaultEpoch && modelsState.generation === generation
            ? modelsState.models
            : provider.models.map((model) => ({
                  id: model.id,
                  name: model.name,
                  context_length: model.context_length,
              }));
    const modelsError =
        modelsState?.epoch === vaultEpoch && modelsState.generation === generation
            ? modelsState.error
            : null;
    const connectionResult =
        testOutcome?.epoch === vaultEpoch && testOutcome.generation === generation
            ? testOutcome
            : null;
    const storedLocked = storedKey && !vaultUnlocked;
    const canSaveKey = Boolean(keyDraft.trim()) && !savingKey;

    return (
        <Card className={config.enabled ? 'ring-2 ring-action/30' : undefined}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">{getProviderIcon()}</span>
                        <div>
                            <CardTitle>{provider.name}</CardTitle>
                            <p className="text-xs text-ink-secondary">{provider.description}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {config.serverConfigured && (
                            <Badge variant="secondary">Server</Badge>
                        )}
                        {connectionResult ? (
                            connectionResult.valid ? (
                                <Badge variant="success">
                                    <Check className="mr-1 size-3" /> Reachable
                                </Badge>
                            ) : (
                                <Badge variant="destructive">
                                    <X className="mr-1 size-3" /> Test failed
                                </Badge>
                            )
                        ) : config.enabled ? (
                            <Badge variant="secondary">Enabled</Badge>
                        ) : null}
                        {isDefault && (
                            <Badge variant="warning">
                                <Zap className="mr-1 size-3" /> Default
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* API Key (if required) */}
                {provider.requires_api_key && (
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label htmlFor={`${provider.id}-api-key`}>Browser API Key</Label>
                            <span className="type-meta text-ink-muted">
                                {storedKey ? 'Stored key · encrypted' : 'No stored key'}
                            </span>
                        </div>

                        {config.serverConfigured && (
                            <p className="type-meta text-ink-secondary">
                                A server key is available for this provider. A browser key below
                                overrides it for your requests.
                            </p>
                        )}
                        {isProduction && config.serverConfigured && (
                            <p className="type-meta text-ink-muted">
                                Server infrastructure credentials never reach the browser.
                            </p>
                        )}
                        {storedLocked && (
                            <p role="status" className="type-meta text-warning">
                                The stored key is locked. Unlock the key vault above to test or use it.
                            </p>
                        )}

                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Input
                                    id={`${provider.id}-api-key`}
                                    type={showKey ? 'text' : 'password'}
                                    value={keyDraft}
                                    onChange={(e) => {
                                        setKeyDraft(e.target.value);
                                        setKeyNotice(null);
                                        invalidateInputs();
                                    }}
                                    placeholder={
                                        storedKey
                                            ? `Enter a new ${provider.name} key to replace the stored key`
                                            : `Enter your ${provider.name} API key`
                                    }
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    aria-label={showKey ? 'Hide API key' : 'Show API key'}
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                >
                                    {showKey ? (
                                        <EyeOff className="size-4" />
                                    ) : (
                                        <Eye className="size-4" />
                                    )}
                                </button>
                            </div>
                            <Button
                                variant="outline"
                                onClick={() => void handleTestConnection()}
                                busy={testing}
                                busyLabel="Testing"
                            >
                                Test
                            </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                onClick={() => void handleSaveKey()}
                                busy={savingKey}
                                busyLabel="Saving"
                                disabled={!canSaveKey}
                            >
                                <KeyRound className="mr-2 size-4" />
                                {storedKey ? 'Update key' : 'Save key'}
                            </Button>
                            {storedKey && (
                                <Button variant="ghost" onClick={handleRemoveKey} disabled={savingKey}>
                                    <Trash2 className="mr-2 size-4" />
                                    Remove stored key
                                </Button>
                            )}
                        </div>

                        {keyNotice && (
                            <p
                                role={keyNotice.tone === 'error' ? 'alert' : 'status'}
                                className={`flex items-center gap-1 type-meta ${
                                    keyNotice.tone === 'error' ? 'text-danger' : 'text-success'
                                }`}
                            >
                                {keyNotice.tone === 'error' ? (
                                    <X className="size-3" />
                                ) : (
                                    <Check className="size-3" />
                                )}
                                {keyNotice.message}
                            </p>
                        )}

                        {connectionResult && (
                            <p
                                role={connectionResult.valid ? 'status' : 'alert'}
                                className={`flex items-center gap-1 type-meta ${connectionResult.valid ? 'text-success' : 'text-danger'}`}
                            >
                                {connectionResult.valid ? (
                                    <Check className="size-3" />
                                ) : (
                                    <X className="size-3" />
                                )}
                                {connectionResult.message}
                            </p>
                        )}
                    </div>
                )}

                {/* Ollama Base URL */}
                {provider.id === 'ollama' && (
                    <div className="space-y-2">
                        <Label htmlFor={`${provider.id}-base-url`}>Ollama URL</Label>
                        <div className="flex gap-2">
                            <Input
                                id={`${provider.id}-base-url`}
                                value={config.baseUrl || 'http://localhost:11434'}
                                onChange={(e) => {
                                    invalidateInputs();
                                    onConfigChange({ baseUrl: e.target.value });
                                }}
                                placeholder="http://localhost:11434"
                                className="flex-1"
                            />
                            <Button
                                variant="outline"
                                onClick={() => void handleTestConnection()}
                                busy={testing}
                                busyLabel="Testing"
                            >
                                Test
                            </Button>
                        </div>
                        {connectionResult && (
                            <p
                                role={connectionResult.valid ? 'status' : 'alert'}
                                className={`flex items-center gap-1 type-meta ${connectionResult.valid ? 'text-success' : 'text-danger'}`}
                            >
                                {connectionResult.valid ? (
                                    <Check className="size-3" />
                                ) : (
                                    <X className="size-3" />
                                )}
                                {connectionResult.message}
                            </p>
                        )}
                    </div>
                )}

                {/* Model Selection — dynamically fetched */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Default Model</Label>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Refresh models"
                            onClick={() => void fetchModels()}
                            disabled={loadingModels}
                        >
                            {loadingModels ? (
                                <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
                            ) : (
                                <RefreshCw className="size-3" />
                            )}
                        </Button>
                    </div>

                    {loadingModels ? (
                        <div className="flex items-center gap-2 py-2 type-meta text-ink-muted">
                            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                            Fetching models...
                        </div>
                    ) : modelsError ? (
                        <div className="type-meta text-warning">{modelsError}</div>
                    ) : models.length === 0 ? (
                        <div className="type-meta text-ink-muted">
                            {storedLocked
                                ? 'Unlock the key vault to load models with the stored key'
                                : provider.requires_api_key && !config.serverConfigured && !keyDraft
                                  ? 'Save an API key to load models'
                                  : 'No models available'}
                        </div>
                    ) : (
                        <Select
                            value={config.model || '__default__'}
                            onValueChange={(model) =>
                                onConfigChange({ model: model === '__default__' ? '' : model })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select a model" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                                <SelectItem value="__default__">
                                    Use Provider Default
                                </SelectItem>
                                {models.map((model) => (
                                    <SelectItem key={model.id} value={model.id}>
                                        <span className="flex items-center gap-2">
                                            {model.name}
                                            {model.context_length && (
                                                <span className="type-meta text-ink-muted">
                                                    {(model.context_length / 1000).toFixed(0)}k ctx
                                                </span>
                                            )}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>

                {/* Temperature Slider */}
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <Label>Temperature</Label>
                        <span className="type-meta type-tabular text-ink-muted">{config.temperature.toFixed(1)}</span>
                    </div>
                    <Slider
                        value={[config.temperature]}
                        onValueChange={([temp]) => onConfigChange({ temperature: temp })}
                        min={0}
                        max={2}
                        step={0.1}
                        className="py-2"
                    />
                    <div className="flex justify-between type-meta text-ink-muted">
                        <span>Precise</span>
                        <span>Creative</span>
                    </div>
                </div>

                {/* Max Tokens */}
                <div className="space-y-2">
                    <Label>Max Tokens</Label>
                    <Input
                        type="number"
                        value={config.maxTokens}
                        onChange={(e) =>
                            onConfigChange({ maxTokens: parseInt(e.target.value) || 2048 })
                        }
                        min={256}
                        max={32000}
                        className="type-tabular"
                    />
                </div>

                {/* Set as Default */}
                <div className="flex items-center justify-between pt-2 border-t border-separator">
                    <div>
                        <Label>Set as Default</Label>
                        <p className="type-meta text-ink-muted">Use this provider for new meetings</p>
                    </div>
                    <Switch
                        checked={isDefault}
                        onCheckedChange={(checked) => checked && onSetDefault()}
                        disabled={!config.enabled && provider.requires_api_key}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
