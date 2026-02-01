'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, Loader2, Save, History, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { personaApi, PersonaWithPrompt, PromptVersion, PersonaUpdate } from '@/lib/api';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function PersonaDetailPage({ params }: PageProps) {
    const { id } = use(params);

    const [persona, setPersona] = useState<PersonaWithPrompt | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Editable form state
    const [name, setName] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [color, setColor] = useState('#6366f1');
    const [promptContent, setPromptContent] = useState('');
    const [promptVersions, setPromptVersions] = useState<PromptVersion[]>([]);
    const [promptDirty, setPromptDirty] = useState(false);

    useEffect(() => {
        loadPersona();
    }, [id]);

    async function loadPersona() {
        try {
            setLoading(true);
            const [p, versions] = await Promise.all([
                personaApi.getPersona(id),
                personaApi.listPromptVersions(id),
            ]);
            setPersona(p);
            setName(p.name);
            setSubtitle(p.subtitle || '');
            setColor(p.color);
            setPromptContent(p.active_prompt || '');
            setPromptVersions(versions);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load persona');
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveMetadata() {
        if (!persona) return;

        try {
            setSaving(true);
            const update: PersonaUpdate = { name, subtitle, color };
            const updated = await personaApi.updatePersona(id, update);
            setPersona(updated);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    }

    async function handleSavePrompt() {
        if (!persona) return;

        try {
            setSaving(true);
            const newVersion = await personaApi.createPromptVersion(id, promptContent);
            setPromptVersions([newVersion, ...promptVersions]);
            setPersona({ ...persona, active_prompt: promptContent, active_prompt_version: newVersion.version });
            setPromptDirty(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save prompt');
        } finally {
            setSaving(false);
        }
    }

    async function handleActivateVersion(version: number) {
        if (!persona) return;

        try {
            setSaving(true);
            await personaApi.activatePromptVersion(id, version);
            const activated = promptVersions.find(v => v.version === version);
            if (activated) {
                setPromptContent(activated.content);
                setPromptVersions(promptVersions.map(v => ({
                    ...v,
                    is_active: v.version === version,
                })));
                setPersona({ ...persona, active_prompt: activated.content, active_prompt_version: version });
            }
            setPromptDirty(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to activate version');
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
        );
    }

    if (!persona) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-lg font-semibold text-white mb-2">Persona Not Found</h2>
                    <Link href="/roster" className="text-emerald-400 hover:underline">
                        Back to Roster
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            {/* Header */}
            <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/roster" className="text-zinc-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: persona.color }}
                            >
                                <Bot className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white">{persona.name}</h1>
                                {persona.subtitle && (
                                    <p className="text-xs text-zinc-500">{persona.subtitle}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-4xl mx-auto px-6 py-8">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                )}

                <Tabs defaultValue="overview" className="space-y-6">
                    <TabsList className="bg-zinc-800/50">
                        <TabsTrigger value="overview" className="data-[state=active]:bg-zinc-700">
                            <Settings2 className="w-4 h-4 mr-2" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="prompt" className="data-[state=active]:bg-zinc-700">
                            <History className="w-4 h-4 mr-2" />
                            System Prompt
                        </TabsTrigger>
                    </TabsList>

                    {/* Overview Tab */}
                    <TabsContent value="overview">
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-white">Persona Settings</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-name">Name</Label>
                                    <Input
                                        id="edit-name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="bg-zinc-800 border-zinc-700"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="edit-subtitle">Role / Subtitle</Label>
                                    <Input
                                        id="edit-subtitle"
                                        value={subtitle}
                                        onChange={(e) => setSubtitle(e.target.value)}
                                        className="bg-zinc-800 border-zinc-700"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Color</Label>
                                    <div className="flex gap-2">
                                        {COLORS.map((c) => (
                                            <button
                                                key={c}
                                                className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'ring-2 ring-white scale-110' : ''
                                                    }`}
                                                style={{ backgroundColor: c }}
                                                onClick={() => setColor(c)}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <Button
                                    onClick={handleSaveMetadata}
                                    disabled={saving}
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    <Save className="w-4 h-4 mr-2" />
                                    Save Changes
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* System Prompt Tab */}
                    <TabsContent value="prompt">
                        <div className="grid gap-6 lg:grid-cols-3">
                            {/* Editor */}
                            <Card className="bg-zinc-900/50 border-zinc-800 lg:col-span-2">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle className="text-white">System Prompt</CardTitle>
                                    {persona.active_prompt_version && (
                                        <span className="text-xs text-zinc-500">
                                            v{persona.active_prompt_version}
                                        </span>
                                    )}
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <Textarea
                                        value={promptContent}
                                        onChange={(e) => {
                                            setPromptContent(e.target.value);
                                            setPromptDirty(true);
                                        }}
                                        placeholder="Define this persona's personality, expertise, and behavior..."
                                        className="bg-zinc-800 border-zinc-700 min-h-[300px] font-mono text-sm"
                                    />

                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-zinc-500">
                                            {promptContent.length} characters
                                        </span>
                                        <Button
                                            onClick={handleSavePrompt}
                                            disabled={saving || !promptDirty}
                                            className="bg-emerald-600 hover:bg-emerald-700"
                                        >
                                            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                            <Save className="w-4 h-4 mr-2" />
                                            Save as New Version
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Version History */}
                            <Card className="bg-zinc-900/50 border-zinc-800">
                                <CardHeader>
                                    <CardTitle className="text-white text-sm">Version History</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {promptVersions.length === 0 ? (
                                        <p className="text-sm text-zinc-500">No versions yet</p>
                                    ) : (
                                        promptVersions.map((v) => (
                                            <button
                                                key={v.id}
                                                onClick={() => handleActivateVersion(v.version)}
                                                disabled={v.is_active}
                                                className={`w-full text-left p-3 rounded-lg transition-colors ${v.is_active
                                                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                                                    : 'bg-zinc-800/50 hover:bg-zinc-800 border border-transparent'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm font-medium text-white">
                                                        Version {v.version}
                                                    </span>
                                                    {v.is_active && (
                                                        <span className="text-xs text-emerald-400">Active</span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-zinc-500">
                                                    {new Date(v.created_at).toLocaleDateString()}
                                                </span>
                                            </button>
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
