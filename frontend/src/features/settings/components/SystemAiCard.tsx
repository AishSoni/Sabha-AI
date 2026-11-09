'use client';

/**
 * System AI configuration card (spec-10).
 *
 * System AI is server-owned: the card edits a draft and commits through the
 * validated mutation. The confirmed snapshot always comes back from the
 * providers query, never from a local preference pretending to be server
 * state. Model discovery is a feature command and never stores the provider
 * key in query state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, RefreshCw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFetchProviderModels, useUpdateSystemAI } from '../api';
import type {
    FetchedModelInfoView,
    FetchModelsResultView,
    ProviderInfoView,
    SystemAIConfigView,
    SystemAIStatusView,
} from '../api';
import { useSettingsStore } from '../state/settings-store';

interface SystemAiCardProps {
    providers: ProviderInfoView[];
    systemAI: SystemAIConfigView;
    systemAIStatus: SystemAIStatusView;
    defaultProvider: string;
}

type DiscoveryState =
    | { status: 'idle' }
    | { status: 'loading'; provider: string }
    | { status: 'ready'; provider: string; models: FetchedModelInfoView[] }
    | { status: 'provider-error'; provider: string; message: string }
    | { status: 'transport-error'; provider: string };

const MIN_MAX_TOKENS = 256;
const MAX_MAX_TOKENS = 16000;

function isValidDraft(draft: SystemAIConfigView): boolean {
    return (
        draft.temperature >= 0 &&
        draft.temperature <= 1 &&
        Number.isInteger(draft.maxTokens) &&
        draft.maxTokens >= MIN_MAX_TOKENS &&
        draft.maxTokens <= MAX_MAX_TOKENS
    );
}

function discoveryFromResult(
    providerId: string,
    result: FetchModelsResultView,
): DiscoveryState {
    if (!result.success) {
        return {
            status: 'provider-error',
            provider: providerId,
            message: result.message || 'The provider rejected model discovery.',
        };
    }
    return {
        status: 'ready',
        provider: providerId,
        models: result.models,
    };
}

export function SystemAiCard({
    providers,
    systemAI,
    systemAIStatus,
    defaultProvider,
}: SystemAiCardProps) {
    // `null` draft means "show the confirmed server snapshot". Once the user
    // edits, the draft owns the form until the mutation confirms it.
    const [draft, setDraft] = useState<SystemAIConfigView | null>(null);
    const [saved, setSaved] = useState(false);
    const [discovery, setDiscovery] = useState<DiscoveryState>({ status: 'idle' });
    const current = draft ?? systemAI;

    const providerConfigs = useSettingsStore((state) => state.providers);
    const getProviderApiKey = useSettingsStore((state) => state.getProviderApiKey);
    const updateSystemAI = useUpdateSystemAI();
    const { mutateAsync: fetchModelsRequest } = useFetchProviderModels();

    const selectedProvider = current.provider || defaultProvider || 'openrouter';
    const latestConfigs = useRef(providerConfigs);
    useEffect(() => {
        latestConfigs.current = providerConfigs;
    }, [providerConfigs]);

    const discoveryToken = useRef(0);
    const loadModels = useCallback(
        (providerId: string) => {
            const providerConfig =
                latestConfigs.current[providerId as keyof typeof latestConfigs.current];
            return fetchModelsRequest({
                provider: providerId,
                apiKey: getProviderApiKey(providerId),
                baseUrl: providerConfig?.baseUrl || undefined,
            });
        },
        [fetchModelsRequest, getProviderApiKey],
    );

    const refreshModels = useCallback(
        (providerId: string) => {
            const token = ++discoveryToken.current;
            setDiscovery({ status: 'loading', provider: providerId });
            void loadModels(providerId)
                .then((result) => {
                    if (token === discoveryToken.current) {
                        setDiscovery(discoveryFromResult(providerId, result));
                    }
                })
                .catch(() => {
                    if (token === discoveryToken.current) {
                        setDiscovery({ status: 'transport-error', provider: providerId });
                    }
                });
        },
        [loadModels],
    );

    // Fetch models when the selected provider changes. The cleanup invalidates
    // a late response from the provider that was previously selected.
    useEffect(() => {
        const token = ++discoveryToken.current;
        const run = async () => {
            try {
                const result = await loadModels(selectedProvider);
                if (token === discoveryToken.current) {
                    setDiscovery(discoveryFromResult(selectedProvider, result));
                }
            } catch {
                if (token === discoveryToken.current) {
                    setDiscovery({ status: 'transport-error', provider: selectedProvider });
                }
            }
        };
        void run();
        return () => {
            discoveryToken.current += 1;
        };
    }, [selectedProvider, loadModels]);

    const edit = (changes: Partial<SystemAIConfigView>) => {
        setSaved(false);
        setDraft((previous) => ({ ...(previous ?? systemAI), ...changes }));
    };

    const handleProviderChange = (value: string) => {
        edit({ provider: value === '__default__' ? '' : value, model: '' });
    };

    const handleModelChange = (value: string) => {
        edit({ model: value === '__default__' ? '' : value });
    };

    const handleSave = async () => {
        if (!draft || !isValidDraft(draft)) return;
        try {
            await updateSystemAI.mutateAsync(draft);
            // The invalidated providers query owns the confirmed snapshot.
            setDraft(null);
            setSaved(true);
        } catch {
            // Keep the draft visible so the values can be retried.
        }
    };

    // A response for another provider is never rendered under the newly selected
    // provider, even for the frame before the discovery effect starts.
    const activeDiscovery: DiscoveryState =
        discovery.status !== 'idle' && discovery.provider === selectedProvider
            ? discovery
            : { status: 'loading', provider: selectedProvider };
    const loadingModels = activeDiscovery.status === 'loading';
    const policyBadge =
        systemAIStatus.state === 'available'
            ? { label: 'Saved policy', variant: 'success' as const }
            : systemAIStatus.state === 'failed'
              ? { label: 'Storage read failed', variant: 'destructive' as const }
              : { label: 'Environment default', variant: 'warning' as const };
    const canSave = draft !== null && isValidDraft(draft) && !updateSystemAI.isPending;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🧠</span>
                    <div>
                        <CardTitle>System AI</CardTitle>
                        <p className="text-xs text-ink-secondary">
                            Server-owned defaults for app-level functions like summarization
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div
                    role={systemAIStatus.state === 'failed' ? 'alert' : 'status'}
                    className={`flex flex-wrap items-center gap-2 rounded-control border px-3 py-2 type-meta ${
                        systemAIStatus.state === 'failed'
                            ? 'border-danger/40 text-danger'
                            : 'border-separator text-ink-secondary'
                    }`}
                >
                    <Badge variant={policyBadge.variant}>{policyBadge.label}</Badge>
                    <span>{systemAIStatus.message}</span>
                    {systemAIStatus.degraded && (
                        <Badge variant="destructive">Degraded</Badge>
                    )}
                </div>

                {/* Provider Selection */}
                <div className="space-y-2">
                    <Label htmlFor="system-ai-provider">Provider</Label>
                    <Select
                        value={current.provider || '__default__'}
                        onValueChange={handleProviderChange}
                    >
                        <SelectTrigger id="system-ai-provider">
                            <SelectValue placeholder="Use default" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__default__">
                                Use Environment Default ({defaultProvider || 'none'})
                            </SelectItem>
                            {providers.map((provider) => (
                                <SelectItem key={provider.id} value={provider.id}>
                                    {provider.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Model Selection - Dynamically Fetched */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="system-ai-model">Model</Label>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Refresh models"
                            onClick={() => void refreshModels(selectedProvider)}
                            disabled={loadingModels}
                        >
                            {loadingModels ? (
                                <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
                            ) : (
                                <RefreshCw className="size-3" />
                            )}
                        </Button>
                    </div>

                    {activeDiscovery.status === 'loading' ? (
                        <div className="flex items-center gap-2 py-2 type-meta text-ink-muted">
                            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                            Fetching models...
                        </div>
                    ) : activeDiscovery.status === 'provider-error' ? (
                        <div role="alert" className="space-y-1">
                            <p className="type-meta text-danger">
                                Model discovery failed. {activeDiscovery.message}
                            </p>
                            <p className="type-meta text-ink-muted">
                                Check the provider credential and try again.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void refreshModels(selectedProvider)}
                            >
                                Retry
                            </Button>
                        </div>
                    ) : activeDiscovery.status === 'transport-error' ? (
                        <div role="alert" className="space-y-1">
                            <p className="type-meta text-danger">
                                Model discovery could not reach the settings API.
                            </p>
                            <p className="type-meta text-ink-muted">
                                Check the API origin in Diagnostics and retry.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void refreshModels(selectedProvider)}
                            >
                                Retry
                            </Button>
                        </div>
                    ) : activeDiscovery.models.length === 0 ? (
                        <div role="status" className="type-meta text-ink-muted">
                            The provider returned no models. The policy can still use the
                            provider default.
                        </div>
                    ) : (
                        <Select
                            value={current.model || '__default__'}
                            onValueChange={handleModelChange}
                        >
                            <SelectTrigger id="system-ai-model">
                                <SelectValue placeholder="Use provider default" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                                <SelectItem value="__default__">
                                    Use Provider Default
                                </SelectItem>
                                {activeDiscovery.models.map((model) => (
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
                        <Label htmlFor="system-ai-temperature">Temperature</Label>
                        <span className="type-meta type-tabular text-ink-muted">
                            {current.temperature.toFixed(1)}
                        </span>
                    </div>
                    <Slider
                        id="system-ai-temperature"
                        value={[current.temperature]}
                        onValueChange={([temperature]) =>
                            edit({ temperature: temperature ?? current.temperature })
                        }
                        min={0}
                        max={1}
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
                    <Label htmlFor="system-ai-max-tokens">Max Tokens</Label>
                    <Input
                        id="system-ai-max-tokens"
                        type="number"
                        value={current.maxTokens}
                        onChange={(event) =>
                            edit({ maxTokens: Number.parseInt(event.target.value, 10) || 0 })
                        }
                        min={MIN_MAX_TOKENS}
                        max={MAX_MAX_TOKENS}
                        className="type-tabular"
                    />
                    {!isValidDraft(current) && (
                        <p className="type-meta text-danger">
                            Max tokens must be between {MIN_MAX_TOKENS} and {MAX_MAX_TOKENS}.
                        </p>
                    )}
                </div>

                {updateSystemAI.isError && (
                    <p role="alert" className="type-meta text-danger">
                        System AI was not saved. {(updateSystemAI.error as Error).message}
                    </p>
                )}

                <div className="flex items-center justify-end gap-3">
                    {saved && (
                        <span className="flex items-center gap-1 type-meta text-success">
                            <Check className="size-3.5" />
                            Saved
                        </span>
                    )}
                    <Button
                        onClick={() => void handleSave()}
                        busy={updateSystemAI.isPending}
                        busyLabel="Saving"
                        disabled={!canSave}
                    >
                        <Save className="mr-2 size-4" />
                        Save System AI
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
