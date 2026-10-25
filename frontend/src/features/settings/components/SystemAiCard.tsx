'use client';

/**
 * System AI configuration card (spec-10).
 *
 * Until the server-owned settings contract lands, the card edits the local
 * preference for app-level functions. Model discovery is a feature command
 * and never stores the provider key in query state.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFetchProviderModels } from '../api';
import type { ProviderInfoView } from '../api';
import { useSettingsStore } from '../state/settings-store';

interface SystemAiCardProps {
    providers: ProviderInfoView[];
}

export function SystemAiCard({ providers }: SystemAiCardProps) {
    const { systemAI, setSystemAI, defaultProvider, providers: providerConfigs } =
        useSettingsStore();
    const { mutateAsync: fetchModelsRequest, data: modelsResult, isPending: loadingModels } =
        useFetchProviderModels();

    const selectedProvider = systemAI.provider || defaultProvider || 'openrouter';
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
                    apiKey: providerConfig?.apiKey || undefined,
                    baseUrl: providerConfig?.baseUrl || undefined,
                });
            } catch {
                // An empty model list renders the failure as "No models".
            }
        },
        [fetchModelsRequest],
    );

    // Fetch models when the selected provider changes.
    useEffect(() => {
        void fetchModelsForProvider(selectedProvider);
    }, [selectedProvider, fetchModelsForProvider]);

    const handleProviderChange = (value: string) => {
        const provider = value === '__default__' ? '' : value;
        setSystemAI({ provider, model: '' }); // Reset model when provider changes
    };

    const handleModelChange = (value: string) => {
        setSystemAI({ model: value === '__default__' ? '' : value });
    };

    const models = modelsResult?.success ? modelsResult.models : [];

    return (
        <Card className="bg-gradient-to-br from-violet-500/20 to-violet-600/10 border-violet-500/30">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🧠</span>
                    <div>
                        <CardTitle className="text-white text-lg">System AI</CardTitle>
                        <p className="text-xs text-zinc-400">
                            Used for app-level functions like summarization
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Provider Selection */}
                <div className="space-y-2">
                    <Label className="text-zinc-300">Provider</Label>
                    <Select
                        value={systemAI.provider || '__default__'}
                        onValueChange={handleProviderChange}
                    >
                        <SelectTrigger className="bg-zinc-900/50 border-zinc-700 text-white">
                            <SelectValue placeholder="Use default" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                            <SelectItem
                                value="__default__"
                                className="text-zinc-400 hover:bg-zinc-800"
                            >
                                Use Default ({defaultProvider || 'none'})
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
                        <Label className="text-zinc-300">Model</Label>
                        <Button
                            variant="ghost"
                            size="sm"
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
                            value={systemAI.model || '__default__'}
                            onValueChange={handleModelChange}
                        >
                            <SelectTrigger className="bg-zinc-900/50 border-zinc-700 text-white">
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
                        <Label className="text-zinc-300">Temperature</Label>
                        <span className="text-xs text-zinc-500">
                            {systemAI.temperature.toFixed(1)}
                        </span>
                    </div>
                    <Slider
                        value={[systemAI.temperature]}
                        onValueChange={([temperature]) => setSystemAI({ temperature })}
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
                    <Label className="text-zinc-300">Max Tokens</Label>
                    <Input
                        type="number"
                        value={systemAI.maxTokens}
                        onChange={(e) => setSystemAI({ maxTokens: parseInt(e.target.value) || 2048 })}
                        min={256}
                        max={16000}
                        className="bg-zinc-900/50 border-zinc-700 text-white"
                    />
                </div>
            </CardContent>
        </Card>
    );
}
