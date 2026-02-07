'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, X, Loader2, Zap, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { settingsApi, ProviderInfo, FetchedModelInfo } from '@/lib/api';
import { ProviderConfig } from '@/stores/settings-store';

interface ProviderCardProps {
    provider: ProviderInfo;
    config: ProviderConfig;
    isDefault: boolean;
    isProduction?: boolean;
    onConfigChange: (config: Partial<ProviderConfig>) => void;
    onSetDefault: () => void;
}

export function ProviderCard({ provider, config, isDefault, isProduction, onConfigChange, onSetDefault }: ProviderCardProps) {
    const [showKey, setShowKey] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);
    const [models, setModels] = useState<FetchedModelInfo[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [modelsError, setModelsError] = useState<string | null>(null);

    // Fetch models on mount if provider is enabled/configured
    useEffect(() => {
        if (config.enabled || config.serverConfigured || provider.id === 'ollama') {
            fetchModels();
        }
    }, [config.enabled, config.serverConfigured]);

    const fetchModels = async () => {
        setLoadingModels(true);
        setModelsError(null);

        try {
            const result = await settingsApi.fetchModels({
                provider: provider.id as 'openrouter' | 'gemini' | 'ollama',
                api_key: config.apiKey || undefined,
                base_url: config.baseUrl || undefined,
            });

            if (result.success) {
                setModels(result.models);
                // Auto-select first model if none selected
                if (!config.model && result.models.length > 0) {
                    onConfigChange({ model: result.models[0].id });
                }
            } else {
                setModelsError(result.message);
            }
        } catch (error) {
            setModelsError('Failed to fetch models');
        } finally {
            setLoadingModels(false);
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);

        try {
            const result = await settingsApi.testKey({
                provider: provider.id as 'openrouter' | 'gemini' | 'ollama',
                api_key: config.apiKey,
                base_url: config.baseUrl,
            });
            setTestResult(result);

            if (result.valid) {
                onConfigChange({ enabled: true });
                // Fetch models after successful test
                fetchModels();
            }
        } catch (error) {
            setTestResult({ valid: false, message: 'Connection failed' });
        } finally {
            setTesting(false);
        }
    };

    const getProviderColor = () => {
        switch (provider.id) {
            case 'openrouter': return 'from-orange-500/20 to-orange-600/10 border-orange-500/30';
            case 'gemini': return 'from-blue-500/20 to-blue-600/10 border-blue-500/30';
            case 'ollama': return 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30';
            default: return 'from-zinc-500/20 to-zinc-600/10 border-zinc-500/30';
        }
    };

    const getProviderIcon = () => {
        switch (provider.id) {
            case 'openrouter': return '🔀';
            case 'gemini': return '✨';
            case 'ollama': return '🦙';
            default: return '🤖';
        }
    };

    return (
        <Card className={`bg-gradient-to-br ${getProviderColor()} border transition-all duration-200 ${config.enabled ? 'ring-2 ring-white/20' : ''}`}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">{getProviderIcon()}</span>
                        <div>
                            <CardTitle className="text-white text-lg">{provider.name}</CardTitle>
                            <p className="text-xs text-zinc-400">{provider.description}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {config.serverConfigured && (
                            <Badge variant="outline" className="bg-blue-500/20 border-blue-500/50 text-blue-400">
                                Server
                            </Badge>
                        )}
                        {config.enabled && (
                            <Badge variant="outline" className="bg-emerald-500/20 border-emerald-500/50 text-emerald-400">
                                <Check className="w-3 h-3 mr-1" /> Active
                            </Badge>
                        )}
                        {isDefault && (
                            <Badge className="bg-amber-500/20 border-amber-500/50 text-amber-400">
                                <Zap className="w-3 h-3 mr-1" /> Default
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* API Key Input (if required) */}
                {provider.requires_api_key && (
                    <div className="space-y-2">
                        <Label className="text-zinc-300">API Key</Label>
                        {isProduction && config.serverConfigured ? (
                            <div className="flex items-center gap-2 py-2 px-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md">
                                <Check className="w-4 h-4 text-emerald-400" />
                                <span className="text-sm text-emerald-400">Configured on server</span>
                            </div>
                        ) : (
                            <>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Input
                                            type={showKey ? 'text' : 'password'}
                                            value={config.apiKey}
                                            onChange={(e) => onConfigChange({ apiKey: e.target.value })}
                                            placeholder={`Enter your ${provider.name} API key`}
                                            className="bg-zinc-900/50 border-zinc-700 text-white pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowKey(!showKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                        >
                                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <Button
                                        variant="outline"
                                        onClick={handleTestConnection}
                                        disabled={testing || !config.apiKey}
                                        className="border-zinc-700 hover:bg-zinc-800"
                                    >
                                        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
                                    </Button>
                                </div>
                                {testResult && (
                                    <p className={`text-xs flex items-center gap-1 ${testResult.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {testResult.valid ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                        {testResult.message}
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Ollama Base URL */}
                {provider.id === 'ollama' && (
                    <div className="space-y-2">
                        <Label className="text-zinc-300">Ollama URL</Label>
                        <div className="flex gap-2">
                            <Input
                                value={config.baseUrl || 'http://localhost:11434'}
                                onChange={(e) => onConfigChange({ baseUrl: e.target.value })}
                                placeholder="http://localhost:11434"
                                className="bg-zinc-900/50 border-zinc-700 text-white flex-1"
                            />
                            <Button
                                variant="outline"
                                onClick={handleTestConnection}
                                disabled={testing}
                                className="border-zinc-700 hover:bg-zinc-800"
                            >
                                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
                            </Button>
                        </div>
                        {testResult && (
                            <p className={`text-xs flex items-center gap-1 ${testResult.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                                {testResult.valid ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                {testResult.message}
                            </p>
                        )}
                    </div>
                )}

                {/* Model Selection - Dynamically Fetched */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-zinc-300">Default Model</Label>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={fetchModels}
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
                    ) : modelsError ? (
                        <div className="text-xs text-amber-400">{modelsError}</div>
                    ) : models.length === 0 ? (
                        <div className="text-xs text-zinc-500">
                            {provider.requires_api_key && !config.apiKey && !config.serverConfigured
                                ? 'Enter API key and test to load models'
                                : 'No models available'}
                        </div>
                    ) : (
                        <Select value={config.model || '__default__'} onValueChange={(model) => onConfigChange({ model: model === '__default__' ? '' : model })}>
                            <SelectTrigger className="bg-zinc-900/50 border-zinc-700 text-white">
                                <SelectValue placeholder="Select a model" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-700 max-h-60">
                                <SelectItem value="__default__" className="text-zinc-400 hover:bg-zinc-800">
                                    Use Provider Default
                                </SelectItem>
                                {models.map((model) => (
                                    <SelectItem key={model.id} value={model.id} className="text-white hover:bg-zinc-800">
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
                        <span className="text-xs text-zinc-500">{config.temperature.toFixed(1)}</span>
                    </div>
                    <Slider
                        value={[config.temperature]}
                        onValueChange={([temp]) => onConfigChange({ temperature: temp })}
                        min={0}
                        max={2}
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
                        value={config.maxTokens}
                        onChange={(e) => onConfigChange({ maxTokens: parseInt(e.target.value) || 2048 })}
                        min={256}
                        max={32000}
                        className="bg-zinc-900/50 border-zinc-700 text-white"
                    />
                </div>

                {/* Set as Default */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-700/50">
                    <div>
                        <Label className="text-zinc-300">Set as Default</Label>
                        <p className="text-xs text-zinc-500">Use this provider for new meetings</p>
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
