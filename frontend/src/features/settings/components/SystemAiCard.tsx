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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFetchProviderModels, useUpdateSystemAI } from '../api';
import type { ProviderInfoView, SystemAIConfigView } from '../api';
import { useSettingsStore } from '../state/settings-store';

interface SystemAiCardProps {
    providers: ProviderInfoView[];
    systemAI: SystemAIConfigView;
    defaultProvider: string;
}

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

export function SystemAiCard({ providers, systemAI, defaultProvider }: SystemAiCardProps) {
    // `null` draft means "show the confirmed server snapshot". Once the user
    // edits, the draft owns the form until the mutation confirms it.
    const [draft, setDraft] = useState<SystemAIConfigView | null>(null);
    const [saved, setSaved] = useState(false);
    const current = draft ?? systemAI;

    const providerConfigs = useSettingsStore((state) => state.providers);
    const getProviderApiKey = useSettingsStore((state) => state.getProviderApiKey);
    const updateSystemAI = useUpdateSystemAI();
    const {
        mutateAsync: fetchModelsRequest,
        data: modelsResult,
        isPending: loadingModels,
    } = useFetchProviderModels();

    const selectedProvider = current.provider || defaultProvider || 'openrouter';
    const latestConfigs = useRef(providerConfigs);
    useEffect(() => {
        latestConfigs.current = providerConfigs;
    }, [providerConfigs]);

    const fetchModelsForProvider = useCallback(
        async (providerId: string) => {
            const providerConfig =
                latestConfigs.current[providerId as keyof typeof latestConfigs.current];
            try {
                await fetchModelsRequest({
                    provider: providerId,
                    apiKey: getProviderApiKey(providerId),
                    baseUrl: providerConfig?.baseUrl || undefined,
                });
            } catch {
                // An empty model list renders the failure as "No models".
            }
        },
        [fetchModelsRequest, getProviderApiKey],
    );

    // Fetch models when the selected provider changes.
    useEffect(() => {
        void fetchModelsForProvider(selectedProvider);
    }, [selectedProvider, fetchModelsForProvider]);

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

    const models = modelsResult?.success ? modelsResult.models : [];
    const canSave = draft !== null && isValidDraft(draft) && !updateSystemAI.isPending;

    return (
        <Card className="bg-gradient-to-br from-violet-500/20 to-violet-600/10 border-violet-500/30">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🧠</span>
                    <div>
                        <CardTitle className="text-white text-lg">System AI</CardTitle>
                        <p className="text-xs text-zinc-400">
                            Server-owned defaults for app-level functions like summarization
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Provider Selection */}
                <div className="space-y-2">
                    <Label htmlFor="system-ai-provider" className="text-zinc-300">
                        Provider
                    </Label>
                    <Select
                        value={current.provider || '__default__'}
                        onValueChange={handleProviderChange}
                    >
                        <SelectTrigger
                            id="system-ai-provider"
                            className="bg-zinc-900/50 border-zinc-700 text-white"
                        >
                            <SelectValue placeholder="Use default" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                            <SelectItem
                                value="__default__"
                                className="text-zinc-400 hover:bg-zinc-800"
                            >
                                Use Environment Default ({defaultProvider || 'none'})
                            </SelectItem>
                            {providers.map((provider) => (
                                <SelectItem
                                    key={provider.id}
                                    value={provider.id}
                                    className="text-white hover:bg-zinc-800"
                                >
                                    {provider.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Model Selection - Dynamically Fetched */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="system-ai-model" className="text-zinc-300">
                            Model
                        </Label>
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Refresh models"
                            onClick={() => void fetchModelsForProvider(selectedProvider)}
                            disabled={loadingModels}
                            className="h-6 px-2 text-xs text-zinc-400 hover:text-white"
                        >
                            {loadingModels ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <RefreshCw className="w-3 h-3" />
                            )}
                        </Button>
                    </div>

                    {loadingModels ? (
                        <div className="flex items-center gap-2 py-2 text-zinc-500 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Fetching models...
                        </div>
                    ) : models.length === 0 ? (
                        <div className="text-xs text-zinc-500">
                            No models available for this provider
                        </div>
                    ) : (
                        <Select
                            value={current.model || '__default__'}
                            onValueChange={handleModelChange}
                        >
                            <SelectTrigger
                                id="system-ai-model"
                                className="bg-zinc-900/50 border-zinc-700 text-white"
                            >
                                <SelectValue placeholder="Use provider default" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-700 max-h-60">
                                <SelectItem
                                    value="__default__"
                                    className="text-zinc-400 hover:bg-zinc-800"
                                >
                                    Use Provider Default
                                </SelectItem>
                                {models.map((model) => (
                                    <SelectItem
                                        key={model.id}
                                        value={model.id}
                                        className="text-white hover:bg-zinc-800"
                                    >
                                        <span className="flex items-center gap-2">
                                            {model.name}
                                            {model.context_length && (
                                                <span className="text-xs text-zinc-500">
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
                        <Label htmlFor="system-ai-temperature" className="text-zinc-300">
                            Temperature
                        </Label>
                        <span className="text-xs text-zinc-500">
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
                    <div className="flex justify-between text-xs text-zinc-600">
                        <span>Precise</span>
                        <span>Creative</span>
                    </div>
                </div>

                {/* Max Tokens */}
                <div className="space-y-2">
                    <Label htmlFor="system-ai-max-tokens" className="text-zinc-300">
                        Max Tokens
                    </Label>
                    <Input
                        id="system-ai-max-tokens"
                        type="number"
                        value={current.maxTokens}
                        onChange={(event) =>
                            edit({ maxTokens: Number.parseInt(event.target.value, 10) || 0 })
                        }
                        min={MIN_MAX_TOKENS}
                        max={MAX_MAX_TOKENS}
                        className="bg-zinc-900/50 border-zinc-700 text-white"
                    />
                    {!isValidDraft(current) && (
                        <p className="text-xs text-red-400">
                            Max tokens must be between {MIN_MAX_TOKENS} and {MAX_MAX_TOKENS}.
                        </p>
                    )}
                </div>

                {updateSystemAI.isError && (
                    <p className="text-xs text-red-400">
                        System AI was not saved. {(updateSystemAI.error as Error).message}
                    </p>
                )}

                <div className="flex items-center justify-end gap-3">
                    {saved && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                            <Check className="w-3.5 h-3.5" />
                            Saved
                        </span>
                    )}
                    <Button
                        onClick={() => void handleSave()}
                        disabled={!canSave}
                        className="bg-violet-600 hover:bg-violet-700"
                    >
                        {updateSystemAI.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4 mr-2" />
                        )}
                        Save System AI
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
