'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Bot, Loader2, MoreVertical, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { personaApi, PersonaWithPrompt, PersonaCreate } from '@/lib/api';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];

export default function RosterPage() {
    const [personas, setPersonas] = useState<PersonaWithPrompt[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Create dialog state
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newPersona, setNewPersona] = useState<PersonaCreate>({
        name: '',
        subtitle: '',
        color: '#6366f1',
        system_prompt: '',
    });

    useEffect(() => {
        loadPersonas();
    }, []);

    async function loadPersonas() {
        try {
            setLoading(true);
            const response = await personaApi.listPersonas();
            setPersonas(response.personas);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load personas');
        } finally {
            setLoading(false);
        }
    }

    async function handleCreate() {
        if (!newPersona.name.trim()) return;

        try {
            setCreating(true);
            const created = await personaApi.createPersona(newPersona);
            setPersonas([created, ...personas]);
            setCreateOpen(false);
            setNewPersona({ name: '', subtitle: '', color: '#6366f1', system_prompt: '' });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create persona');
        } finally {
            setCreating(false);
        }
    }

    async function handleDuplicate(persona: PersonaWithPrompt) {
        try {
            const created = await personaApi.createPersona({
                name: `${persona.name} (Copy)`,
                subtitle: persona.subtitle || undefined,
                color: persona.color,
                system_prompt: persona.active_prompt || undefined,
            });
            setPersonas([created, ...personas]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to duplicate persona');
        }
    }

    async function handleDelete(personaId: string) {
        try {
            await personaApi.deletePersona(personaId);
            setPersonas(personas.filter(p => p.id !== personaId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete persona');
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            {/* Header */}
            <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-white">AI Roster</h1>
                            <p className="text-xs text-zinc-500">Manage your AI personas</p>
                        </div>
                    </div>

                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-emerald-600 hover:bg-emerald-700">
                                <Plus className="w-4 h-4 mr-2" />
                                Create Persona
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-zinc-900 border-zinc-800">
                            <DialogHeader>
                                <DialogTitle className="text-white">Create New Persona</DialogTitle>
                                <DialogDescription>
                                    Define a new AI persona for your meetings.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Name</Label>
                                    <Input
                                        id="name"
                                        placeholder="e.g., The Strategist"
                                        value={newPersona.name}
                                        onChange={(e) => setNewPersona({ ...newPersona, name: e.target.value })}
                                        className="bg-zinc-800 border-zinc-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="subtitle">Role / Subtitle</Label>
                                    <Input
                                        id="subtitle"
                                        placeholder="e.g., Strategic Planning Expert"
                                        value={newPersona.subtitle || ''}
                                        onChange={(e) => setNewPersona({ ...newPersona, subtitle: e.target.value })}
                                        className="bg-zinc-800 border-zinc-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Color</Label>
                                    <div className="flex gap-2">
                                        {COLORS.map((color) => (
                                            <button
                                                key={color}
                                                className={`w-8 h-8 rounded-full transition-transform ${newPersona.color === color ? 'ring-2 ring-white scale-110' : ''
                                                    }`}
                                                style={{ backgroundColor: color }}
                                                onClick={() => setNewPersona({ ...newPersona, color })}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="prompt">System Prompt (Optional)</Label>
                                    <Textarea
                                        id="prompt"
                                        placeholder="Define this persona's personality, expertise, and behavior..."
                                        value={newPersona.system_prompt || ''}
                                        onChange={(e) => setNewPersona({ ...newPersona, system_prompt: e.target.value })}
                                        className="bg-zinc-800 border-zinc-700 min-h-[100px]"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleCreate}
                                    disabled={!newPersona.name.trim() || creating}
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                    {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Create Persona
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-6 py-8">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-8">
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                    </div>
                ) : personas.length === 0 ? (
                    <div className="text-center py-20">
                        <Bot className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
                        <h2 className="text-lg font-semibold text-white mb-2">No Personas Yet</h2>
                        <p className="text-zinc-400 text-sm mb-6">
                            Create your first AI persona to get started.
                        </p>
                        <Button
                            onClick={() => setCreateOpen(true)}
                            className="bg-emerald-600 hover:bg-emerald-700"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Create Persona
                        </Button>
                    </div>
                ) : (
                    <>
                        <h2 className="text-lg font-semibold text-white mb-4">
                            Your Personas ({personas.length})
                        </h2>

                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {personas.map((persona) => (
                                <Card key={persona.id} className="bg-zinc-900/50 border-zinc-800 group">
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-10 h-10 rounded-full flex items-center justify-center"
                                                    style={{ backgroundColor: persona.color }}
                                                >
                                                    <Bot className="w-5 h-5 text-white" />
                                                </div>
                                                <div>
                                                    <Link href={`/roster/${persona.id}`}>
                                                        <CardTitle className="text-white text-base hover:text-emerald-400 transition-colors cursor-pointer">
                                                            {persona.name}
                                                        </CardTitle>
                                                    </Link>
                                                    {persona.subtitle && (
                                                        <CardDescription
                                                            className="text-xs"
                                                            style={{ color: persona.color }}
                                                        >
                                                            {persona.subtitle}
                                                        </CardDescription>
                                                    )}
                                                </div>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <MoreVertical className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent className="bg-zinc-800 border-zinc-700">
                                                    <DropdownMenuItem
                                                        onClick={() => handleDuplicate(persona)}
                                                        className="text-zinc-300 focus:text-white"
                                                    >
                                                        <Copy className="w-4 h-4 mr-2" />
                                                        Duplicate
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleDelete(persona.id)}
                                                        className="text-red-400 focus:text-red-300"
                                                    >
                                                        <Trash2 className="w-4 h-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-zinc-500 line-clamp-2">
                                            {persona.active_prompt
                                                ? persona.active_prompt.substring(0, 100) + (persona.active_prompt.length > 100 ? '...' : '')
                                                : 'No system prompt configured'}
                                        </p>
                                        {persona.active_prompt_version && (
                                            <p className="text-xs text-zinc-600 mt-2">
                                                Prompt v{persona.active_prompt_version}
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
