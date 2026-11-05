'use client';

/**
 * Provider configuration card (spec-10).
 *
 * Local choices (enabled, model, temperature, max tokens, vaulted key) belong
 * to the settings store; key tests and model discovery are explicit commands
 * owned by the feature API. Secrets never enter query state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Check, X, Loader2, Zap, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useFetchProviderModels, useTestProviderKey } from '../api';
import type { ProviderInfoView } from '../api';
import type { ProviderConfig } from '../state/settings-store';

interface ProviderCardProps {
    provider: ProviderInfoView;
    config: ProviderConfig;
    isDefault: boolean;
    isProduction?: boolean;
    onConfigChange: (config: Partial<ProviderConfig>) => void;
    onSetDefault: () => void;
}

export function ProviderCard({
    provider,
    config,
    isDefault,
    isProduction,
    onConfigChange,
    onSetDefault,
}: ProviderCardProps) {
    const [showKey, setShowKey] = useState(false);
    const {
        mutateAsync: fetchModelsRequest,
        data: modelsResult,
        error: modelsFailure,
        isPending: loadingModels,
    } = useFetchProviderModels();
    const {
        mutateAsync: testKeyRequest,
        data: testResult,
        error: testFailure,
        isPending: testing,
        reset: resetTest,
    } = useTestProviderKey();

    // The mount effect must not refetch when a parent re-render creates a new
    // callback; read the latest card inputs at call time instead.
    const latest = useRef({ provider, config, onConfigChange });
    useEffect(() => {
        latest.current = { provider, config, onConfigChange };
    }, [provider, config, onConfigChange]);

    const fetchModels = useCallback(async () => {
        const current = latest.current;
        try {
            const result = await fetchModelsRequest({
                provider: current.provider.id,
                apiKey: current.config.apiKey || undefined,
                baseUrl: current.config.baseUrl || undefined,
            });
            if (result.success && !current.config.model && result.models.length > 0) {
                current.onConfigChange({ model: result.models[0]!.id });
            }
        } catch {
            // Surfaced through the mutation's error state.
        }
    }, [fetchModelsRequest]);

    // Fetch models on mount if provider is enabled/configured.
    useEffect(() => {
        if (config.enabled || config.serverConfigured || provider.id === 'ollama') {
            void fetchModels();
        }
    }, [config.enabled, config.serverConfigured, provider.id, fetchModels]);

    const handleTestConnection = async () => {
        resetTest();
        try {
            const result = await testKeyRequest({
                provider: provider.id,
                apiKey: config.apiKey || undefined,
                baseUrl: config.baseUrl || undefined,
            });
            if (result.valid) {
                onConfigChange({ enabled: true });
                // Fetch models after a successful test.
                void fetchModels();
            }
        } catch {
            // The failure is rendered below from the mutation error.
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

    const models = modelsResult?.models ?? [];
    const modelsError = modelsFailure
        ? 'Failed to fetch models'
        : modelsResult && !modelsResult.success
          ? modelsResult.message
          : null;
    const connectionResult: { valid: boolean; message: string } | null = testFailure
        ? { valid: false, message: 'Connection failed' }
        : (testResult ?? null);

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
                        {config.enabled && (
                            <Badge variant="success">
                                <Check className="mr-1 size-3" /> Active
                            </Badge>
                        )}
                        {isDefault && (
                            <Badge variant="warning">
                                <Zap className="mr-1 size-3" /> Default
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* API Key Input (if required) */}
                {provider.requires_api_key && (
                    <div className="space-y-2">
                        <Label>API Key</Label>
                        {isProduction && config.serverConfigured ? (
                            <div className="flex items-center gap-2 rounded-control border border-success/40 bg-success-soft px-3 py-2">
                                <Check className="size-4 text-success" />
                                <span className="type-body text-success">Configured on server</span>
                            </div>
                        ) : (
                            <>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Input
                                            type={showKey ? 'text' : 'password'}
                                            value={config.apiKey}
                                            onChange={(e) =>
                                                onConfigChange({ apiKey: e.target.value })
                                            }
                                            placeholder={`Enter your ${provider.name} API key`}
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
                                        onClick={handleTestConnection}
                                        busy={testing}
                                        busyLabel="Testing"
                                        disabled={!config.apiKey}
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
                            </>
                        )}
                    </div>
                )}

                {/* Ollama Base URL */}
                {provider.id === 'ollama' && (
                    <div className="space-y-2">
                        <Label>Ollama URL</Label>
                        <div className="flex gap-2">
                            <Input
                                value={config.baseUrl || 'http://localhost:11434'}
                                onChange={(e) => onConfigChange({ baseUrl: e.target.value })}
                                placeholder="http://localhost:11434"
                                className="flex-1"
                            />
                            <Button
                                variant="outline"
                                onClick={handleTestConnection}
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
                            {provider.requires_api_key && !config.apiKey && !config.serverConfigured
                                ? 'Enter API key and test to load models'
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
