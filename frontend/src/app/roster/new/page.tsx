'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Bot, Sparkles, Wand2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { personaApi, PersonaCreate, knowledgeStacksApi, KnowledgeStack } from '@/lib/api';

const COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f43f5e'
];

const PERSONA_TEMPLATES = [
    { name: 'The Strategist', subtitle: 'Strategic Planning Expert', color: '#6366f1', prompt: 'You are a strategic planning expert who helps analyze business situations, identify opportunities and risks, and develop actionable strategies. Focus on long-term thinking and competitive advantage.' },
    { name: 'The Devil\'s Advocate', subtitle: 'Critical Analysis Specialist', color: '#ef4444', prompt: 'You challenge ideas and assumptions constructively. Your role is to identify weaknesses, potential risks, and blind spots. Be respectful but thorough in your critique.' },
    { name: 'The Innovator', subtitle: 'Creative Solutions Expert', color: '#f97316', prompt: 'You think outside the box and propose creative, unconventional solutions. Draw from diverse industries and disciplines to inspire fresh approaches.' },
    { name: 'The Pragmatist', subtitle: 'Implementation Specialist', color: '#22c55e', prompt: 'You focus on practical execution. Break down ideas into actionable steps, identify resource requirements, and create realistic timelines.' },
];

export default function NewPersonaPage() {
    const router = useRouter();
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [persona, setPersona] = useState<PersonaCreate>({
        name: '',
        subtitle: '',
        color: '#6366f1',
        system_prompt: '',
    });

    const [availableStacks, setAvailableStacks] = useState<KnowledgeStack[]>([]);
    const [selectedStacks, setSelectedStacks] = useState<string[]>([]);

    useEffect(() => {
        knowledgeStacksApi.listStacks()
            .then(res => setAvailableStacks(res.stacks))
            .catch(console.error);
    }, []);

    const handleCreate = async () => {
        if (!persona.name.trim()) return;

        try {
            setCreating(true);
            setError(null);
            await personaApi.createPersona({ ...persona, stack_ids: selectedStacks });
            router.push('/roster');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create persona');
        } finally {
            setCreating(false);
        }
    };

    const applyTemplate = (template: typeof PERSONA_TEMPLATES[0]) => {
        setPersona({
            name: template.name,
            subtitle: template.subtitle,
            color: template.color,
            system_prompt: template.prompt,
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            {/* Header */}
            <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/roster" className="text-zinc-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-white">Create AI Persona</h1>
                            <p className="text-xs text-zinc-500">Define a new AI advisor for your meetings</p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-4xl mx-auto px-6 py-8">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-8">
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                )}

                <div className="grid lg:grid-cols-[1fr,300px] gap-8">
                    {/* Left Column - Main Form */}
                    <div className="space-y-8">
                        {/* Preview Card */}
                        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
                            <div className="h-2" style={{ backgroundColor: persona.color }} />
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-16 h-16 rounded-full flex items-center justify-center"
                                        style={{ backgroundColor: persona.color }}
                                    >
                                        <Bot className="w-8 h-8 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <h2 className="text-xl font-bold text-white">
                                            {persona.name || 'Persona Name'}
                                        </h2>
                                        <p className="text-sm" style={{ color: persona.color }}>
                                            {persona.subtitle || 'Role / Subtitle'}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Name Input */}
                        <section className="space-y-3">
                            <Label htmlFor="name" className="text-lg font-semibold text-white">
                                Name <span className="text-red-400">*</span>
                            </Label>
                            <Input
                                id="name"
                                placeholder="e.g., The Strategist"
                                value={persona.name}
                                onChange={(e) => setPersona({ ...persona, name: e.target.value })}
                                className="bg-zinc-900 border-zinc-700 text-white text-lg h-12"
                            />
                        </section>

                        {/* Subtitle Input */}
                        <section className="space-y-3">
                            <Label htmlFor="subtitle" className="text-lg font-semibold text-white">
                                Role / Subtitle
                            </Label>
                            <Input
                                id="subtitle"
                                placeholder="e.g., Strategic Planning Expert"
                                value={persona.subtitle || ''}
                                onChange={(e) => setPersona({ ...persona, subtitle: e.target.value })}
                                className="bg-zinc-900 border-zinc-700 text-white h-11"
                            />
                        </section>

                        {/* Color Picker */}
                        <section className="space-y-3">
                            <Label className="text-lg font-semibold text-white">Color</Label>
                            <div className="flex gap-3 flex-wrap">
                                {COLORS.map((color) => (
                                    <button
                                        key={color}
                                        className={`w-10 h-10 rounded-full transition-all ${persona.color === color
                                            ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110'
                                            : 'hover:scale-105'
                                            }`}
                                        style={{ backgroundColor: color }}
                                        onClick={() => setPersona({ ...persona, color })}
                                    />
                                ))}
                            </div>
                        </section>

                        {/* System Prompt */}
                        <section className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="prompt" className="text-lg font-semibold text-white">
                                    System Prompt
                                </Label>
                                <div className="flex items-center gap-2 text-xs text-zinc-500">
                                    <Sparkles className="w-3 h-3" />
                                    Define personality & expertise
                                </div>
                            </div>
                            <Textarea
                                id="prompt"
                                placeholder="Define this persona's personality, expertise, communication style, and how they should approach problems..."
                                value={persona.system_prompt || ''}
                                onChange={(e) => setPersona({ ...persona, system_prompt: e.target.value })}
                                className="bg-zinc-900 border-zinc-700 text-white min-h-[200px]"
                            />
                            <p className="text-xs text-zinc-500">
                                This prompt shapes how the AI will respond in meetings. Be specific about expertise, tone, and approach.
                            </p>
                        </section>

                        {/* Knowledge Stacks */}
                        <section className="space-y-3 pt-4 border-t border-zinc-800">
                            <div className="flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-blue-400" />
                                <Label className="text-lg font-semibold text-white">
                                    Knowledge Stacks
                                </Label>
                            </div>
                            <p className="text-sm text-zinc-400 mb-4">
                                Select document domains this AI can query during a meeting.
                            </p>
                            {availableStacks.length === 0 ? (
                                <div className="text-sm text-zinc-500 italic p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
                                    No knowledge stacks available. <Link href="/knowledge-stacks/new" className="text-blue-400 hover:underline">Create one</Link>
                                </div>
                            ) : (
                                <div className="grid gap-2">
                                    {availableStacks.map((stack) => {
                                        const isSelected = selectedStacks.includes(stack.id);
                                        return (
                                            <label
                                                key={stack.id}
                                                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isSelected
                                                        ? 'bg-blue-900/20 border-blue-500/50'
                                                        : 'bg-zinc-800/30 border-zinc-800 hover:border-zinc-700'
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedStacks([...selectedStacks, stack.id]);
                                                        } else {
                                                            setSelectedStacks(selectedStacks.filter(id => id !== stack.id));
                                                        }
                                                    }}
                                                    className="mt-1 flex-shrink-0"
                                                />
                                                <div>
                                                    <div className="text-sm font-medium text-white">{stack.name}</div>
                                                    {stack.description && (
                                                        <div className="text-xs text-zinc-500 mt-0.5">{stack.description}</div>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* Right Column - Templates */}
                    <div className="lg:sticky lg:top-24 lg:self-start">
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardContent className="p-6 space-y-4">
                                <div className="flex items-center gap-2">
                                    <Wand2 className="w-5 h-5 text-purple-400" />
                                    <Label className="text-white font-semibold">
                                        Quick Templates
                                    </Label>
                                </div>
                                <p className="text-xs text-zinc-500">
                                    Start with a template and customize it to your needs
                                </p>

                                <div className="space-y-2">
                                    {PERSONA_TEMPLATES.map((template) => (
                                        <button
                                            key={template.name}
                                            onClick={() => applyTemplate(template)}
                                            className="w-full flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all text-left"
                                        >
                                            <div
                                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                                style={{ backgroundColor: template.color }}
                                            >
                                                <Bot className="w-4 h-4 text-white" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">
                                                    {template.name}
                                                </p>
                                                <p className="text-xs text-zinc-500 truncate">
                                                    {template.subtitle}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
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
                        disabled={!persona.name.trim() || creating}
                        className="bg-emerald-600 hover:bg-emerald-700 px-8"
                    >
                        {creating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            'Create Persona'
                        )}
                    </Button>
                </div>
            </main>
        </div>
    );
}
