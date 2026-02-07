'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Upload, X, Bot, FileText, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { api, personaApi } from '@/lib/api';

interface RosterItem {
    id: string;
    name: string;
    subtitle: string | null;
    color: string;
    selected: boolean;
}

export default function NewMeetingPage() {
    const router = useRouter();
    const [isCreating, setIsCreating] = useState(false);
    const [loadingRoster, setLoadingRoster] = useState(true);

    // Form state
    const [agenda, setAgenda] = useState('');
    const [context, setContext] = useState('');
    const [roster, setRoster] = useState<RosterItem[]>([]);
    const [documents, setDocuments] = useState<File[]>([]);

    useEffect(() => {
        loadPersonas();
    }, []);

    async function loadPersonas() {
        try {
            setLoadingRoster(true);
            const response = await personaApi.listPersonas(undefined, true);
            const items: RosterItem[] = response.personas.map(p => ({
                id: p.id,
                name: p.name,
                subtitle: p.subtitle,
                color: p.color,
                selected: true,
            }));
            setRoster(items);
        } catch (err) {
            console.error('Failed to load personas:', err);
            setRoster([]);
        } finally {
            setLoadingRoster(false);
        }
    }

    const handleRosterToggle = (id: string) => {
        setRoster(roster.map(p =>
            p.id === id ? { ...p, selected: !p.selected } : p
        ));
    };

    const handleSelectAll = () => {
        const allSelected = roster.every(p => p.selected);
        setRoster(roster.map(p => ({ ...p, selected: !allSelected })));
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setDocuments([...documents, ...Array.from(e.target.files)]);
        }
    };

    const removeDocument = (index: number) => {
        setDocuments(documents.filter((_, i) => i !== index));
    };

    const handleCreate = async () => {
        if (!agenda.trim()) return;

        const selectedPersonaIds = roster.filter(p => p.selected).map(p => p.id);
        if (selectedPersonaIds.length === 0) return;

        setIsCreating(true);
        try {
            const meeting = await api.createMeeting(
                agenda.trim(),
                context.trim(),
                selectedPersonaIds
            );

            // Navigate to the new meeting
            router.push(`/meetings/${meeting.id}`);
        } catch (err) {
            console.error('Failed to create meeting:', err);
        } finally {
            setIsCreating(false);
        }
    };

    const selectedCount = roster.filter(p => p.selected).length;

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            {/* Header */}
            <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-white">Create Meeting Room</h1>
                            <p className="text-xs text-zinc-500">Set up a new AI advisory session</p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-4xl mx-auto px-6 py-8">
                <div className="grid lg:grid-cols-[1fr,320px] gap-8">
                    {/* Left Column - Main Form */}
                    <div className="space-y-8">
                        {/* Meeting Agenda */}
                        <section className="space-y-4">
                            <div>
                                <Label htmlFor="agenda" className="text-lg font-semibold text-white">
                                    Meeting Agenda <span className="text-red-400">*</span>
                                </Label>
                                <p className="text-sm text-zinc-500 mt-1">
                                    A concise title describing what this meeting is about
                                </p>
                            </div>
                            <Input
                                id="agenda"
                                placeholder="e.g., Product launch strategy for Q2"
                                value={agenda}
                                onChange={(e) => setAgenda(e.target.value)}
                                className="bg-zinc-900 border-zinc-700 text-white text-lg h-12"
                            />
                        </section>

                        {/* Meeting Context */}
                        <section className="space-y-4">
                            <div>
                                <Label htmlFor="context" className="text-lg font-semibold text-white">
                                    Meeting Context
                                </Label>
                                <p className="text-sm text-zinc-500 mt-1">
                                    Extra details to help the AI advisors understand the situation
                                </p>
                            </div>
                            <Textarea
                                id="context"
                                placeholder="Provide additional context, background information, constraints, or specific questions you want addressed..."
                                value={context}
                                onChange={(e) => setContext(e.target.value)}
                                className="bg-zinc-900 border-zinc-700 text-white min-h-[150px]"
                            />
                        </section>

                        {/* Shared Documents */}
                        <section className="space-y-4">
                            <div>
                                <Label className="text-lg font-semibold text-white">
                                    Shared Documents
                                </Label>
                                <p className="text-sm text-zinc-500 mt-1">
                                    Documents will be available for RAG search by all AI advisors
                                </p>
                            </div>
                            <div className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center hover:border-zinc-600 transition-colors bg-zinc-900/30">
                                <input
                                    type="file"
                                    multiple
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    id="file-upload"
                                    accept=".pdf,.doc,.docx,.txt,.md"
                                />
                                <label htmlFor="file-upload" className="cursor-pointer">
                                    <Upload className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
                                    <p className="text-sm text-zinc-400">
                                        Click to upload documents
                                    </p>
                                    <p className="text-xs text-zinc-600 mt-2">
                                        PDF, DOC, TXT, MD (Coming soon)
                                    </p>
                                </label>
                            </div>

                            {documents.length > 0 && (
                                <div className="space-y-2">
                                    {documents.map((file, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg"
                                        >
                                            <FileText className="w-5 h-5 text-zinc-500" />
                                            <span className="text-sm text-zinc-300 flex-1 truncate">
                                                {file.name}
                                            </span>
                                            <button
                                                onClick={() => removeDocument(i)}
                                                className="text-zinc-500 hover:text-red-400"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* Right Column - Roster Selection */}
                    <div className="lg:sticky lg:top-24 lg:self-start">
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardContent className="p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Users className="w-5 h-5 text-indigo-400" />
                                        <Label className="text-white font-semibold">
                                            AI Roster
                                        </Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleSelectAll}
                                            className="text-xs text-zinc-400 hover:text-white h-7"
                                        >
                                            {roster.every(p => p.selected) ? 'Deselect All' : 'Select All'}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={loadPersonas}
                                            disabled={loadingRoster}
                                            className="text-zinc-400 hover:text-white h-7 px-2"
                                        >
                                            <RefreshCw className={`w-3 h-3 ${loadingRoster ? 'animate-spin' : ''}`} />
                                        </Button>
                                    </div>
                                </div>

                                <p className="text-xs text-zinc-500">
                                    Select which AI advisors should participate ({selectedCount} selected)
                                </p>

                                {loadingRoster ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                                    </div>
                                ) : roster.length === 0 ? (
                                    <div className="text-center py-8 border border-dashed border-zinc-700 rounded-lg">
                                        <Bot className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                                        <p className="text-sm text-zinc-500">No personas available</p>
                                        <Link href="/roster/new" className="text-xs text-indigo-400 hover:underline mt-2 inline-block">
                                            Create a persona first →
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                        {roster.map((persona) => (
                                            <div
                                                key={persona.id}
                                                className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${persona.selected
                                                        ? 'bg-zinc-800 border-zinc-600'
                                                        : 'bg-zinc-900/50 border-zinc-800 opacity-60'
                                                    }`}
                                                onClick={() => handleRosterToggle(persona.id)}
                                            >
                                                <Checkbox
                                                    checked={persona.selected}
                                                    onCheckedChange={() => handleRosterToggle(persona.id)}
                                                    className="border-zinc-600"
                                                />
                                                <div
                                                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                                    style={{ backgroundColor: persona.color }}
                                                >
                                                    <Bot className="w-4 h-4 text-white" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{persona.name}</p>
                                                    {persona.subtitle && (
                                                        <p className="text-xs text-zinc-500 truncate">{persona.subtitle}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-12 flex items-center justify-end gap-4 border-t border-zinc-800 pt-8">
                    <Button
                        variant="ghost"
                        onClick={() => router.back()}
                        className="text-zinc-400"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={!agenda.trim() || isCreating || selectedCount === 0}
                        className="bg-indigo-600 hover:bg-indigo-700 px-8"
                    >
                        {isCreating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            'Create Meeting Room'
                        )}
                    </Button>
                </div>
            </main>
        </div>
    );
}
