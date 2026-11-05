'use client';

/**
 * New-persona screen shared by the operator roster and the demo workspace.
 *
 * The client, stack source, and navigation are injected. The form body, quick
 * templates, colour palette, request shape, and stack selection are the base
 * app's flow.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, Sparkles, Wand2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import type { PersonaCatalogClient } from '../model/client';
import type { PersonaCreateInput, PersonaStackOption } from '../model/types';
import { readableTextOn } from '@/lib/readable-color';
import { normalizeStackIds, validatePersonaTemplate } from './validation';

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

export interface NewPersonaRoutes {
    roster: string;
    persona: (personaId: string) => string;
    afterCreate: (personaId: string) => void;
    cancel: () => void;
    stacks?: string;
}

export interface NewPersonaScreenProps {
    client: PersonaCatalogClient;
    loadStacks: () => Promise<PersonaStackOption[]>;
    routes: NewPersonaRoutes;
    stacksHint?: string;
}

export function NewPersonaScreen({ client, loadStacks, routes, stacksHint }: NewPersonaScreenProps) {
    const [creating, setCreating] = useState(false);
    const creatingRef = useRef(false);
    const [error, setError] = useState<string | null>(null);

    const [persona, setPersona] = useState<PersonaCreateInput>({
        name: '',
        subtitle: '',
        color: '#6366f1',
        system_prompt: '',
    });

    const [availableStacks, setAvailableStacks] = useState<PersonaStackOption[]>([]);
    const [selectedStacks, setSelectedStacks] = useState<string[]>([]);

    useEffect(() => {
        let active = true;
        loadStacks()
            .then((stacks) => {
                if (active) setAvailableStacks(stacks);
            })
            .catch(console.error);
        return () => {
            active = false;
        };
    }, [loadStacks]);

    const handleCreate = async () => {
        if (!persona.name.trim() || creatingRef.current) return;
        const problems = validatePersonaTemplate({
            name: persona.name,
            subtitle: persona.subtitle,
            color: persona.color,
        });
        if (problems.length > 0) {
            setError(problems.join('; '));
            return;
        }

        try {
            creatingRef.current = true;
            setCreating(true);
            setError(null);
            const created = await client.create({
                ...persona,
                stack_ids: normalizeStackIds(selectedStacks),
            });
            routes.afterCreate(created.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create persona');
        } finally {
            creatingRef.current = false;
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
        <div className="min-h-screen bg-gradient-to-br from-canvas via-surface to-canvas text-ink">
            {/* Header */}
            <header className="sticky top-0 z-chrome border-b border-separator bg-canvas/80 backdrop-blur-sm">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={routes.roster} className="text-ink-secondary hover:text-ink m-control">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-ink">Create AI Persona</h1>
                            <p className="text-xs text-ink-muted">Define a new AI advisor for your meetings</p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-4xl mx-auto px-6 py-8">
                {error && (
                    <div role="alert" className="mb-8 rounded-group border border-danger/40 bg-danger-soft p-4">
                        <p className="type-body text-danger">{error}</p>
                    </div>
                )}

                <div className="grid lg:grid-cols-[1fr,300px] gap-8">
                    {/* Left Column - Main Form */}
                    <div className="space-y-8">
                        {/* Preview Card */}
                        <Card className="overflow-hidden">
                            <div className="h-2" style={{ backgroundColor: persona.color }} />
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div
                                        className="flex h-16 w-16 items-center justify-center rounded-full"
                                        style={{
                                            backgroundColor: persona.color ?? '#6366f1',
                                            color: readableTextOn(persona.color ?? '#6366f1'),
                                        }}
                                    >
                                        <Bot className="h-8 w-8" />
                                    </div>
                                    <div className="flex-1">
                                        <h2 className="type-item-title text-ink">
                                            {persona.name || 'Persona Name'}
                                        </h2>
                                        <p className="type-body text-ink-secondary">
                                            {persona.subtitle || 'Role / Subtitle'}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Name Input */}
                        <section className="space-y-3">
                            <Label htmlFor="name" className="text-lg font-semibold text-ink">
                                Name <span className="text-danger">*</span>
                            </Label>
                            <Input
                                id="name"
                                placeholder="e.g., The Strategist"
                                value={persona.name}
                                onChange={(e) => setPersona({ ...persona, name: e.target.value })}
                                className="h-12 text-lg"
                            />
                        </section>

                        {/* Subtitle Input */}
                        <section className="space-y-3">
                            <Label htmlFor="subtitle" className="text-lg font-semibold text-ink">
                                Role / Subtitle
                            </Label>
                            <Input
                                id="subtitle"
                                placeholder="e.g., Strategic Planning Expert"
                                value={persona.subtitle || ''}
                                onChange={(e) => setPersona({ ...persona, subtitle: e.target.value })}
                                className="h-11"
                            />
                        </section>

                        {/* Color Picker */}
                        <section className="space-y-3">
                            <Label className="text-lg font-semibold text-ink">Color</Label>
                            <div className="flex gap-3 flex-wrap">
                                {COLORS.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        aria-label={`Select ${color}`}
                                        aria-pressed={persona.color === color}
                                        className={`m-control size-10 rounded-full ${persona.color === color
                                            ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface'
                                            : 'hover:ring-2 hover:ring-control hover:ring-offset-2 hover:ring-offset-surface'
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
                                <Label htmlFor="prompt" className="text-lg font-semibold text-ink">
                                    System Prompt
                                </Label>
                                <div className="flex items-center gap-2 text-xs text-ink-muted">
                                    <Sparkles className="w-3 h-3" />
                                    Define personality & expertise
                                </div>
                            </div>
                            <Textarea
                                id="prompt"
                                placeholder="Define this persona's personality, expertise, communication style, and how they should approach problems..."
                                value={persona.system_prompt || ''}
                                onChange={(e) => setPersona({ ...persona, system_prompt: e.target.value })}
                                className="min-h-[200px]"
                            />
                            <p className="text-xs text-ink-muted">
                                This prompt shapes how the AI will respond in meetings. Be specific about expertise, tone, and approach.
                            </p>
                        </section>

                        {/* Knowledge Stacks */}
                        <section className="space-y-3 pt-4 border-t border-separator">
                            <div className="flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-action" />
                                <Label className="text-lg font-semibold text-ink">
                                    Knowledge Stacks
                                </Label>
                            </div>
                            <p className="text-sm text-ink-secondary mb-4">
                                {stacksHint ??
                                    'Select document domains this AI can query during a meeting.'}
                            </p>
                            {availableStacks.length === 0 ? (
                                <div className="rounded-control border border-separator bg-surface-raised/50 p-4 type-body italic text-ink-muted">
                                    No knowledge stacks available.
                                    {routes.stacks && (
                                        <>
                                            {' '}
                                            <Link href={routes.stacks} className="text-action hover:underline">
                                                Create one
                                            </Link>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="grid gap-2">
                                    {availableStacks.map((stack) => {
                                        const isSelected = selectedStacks.includes(stack.id);
                                        return (
                                            <label
                                                key={stack.id}
                                                className={`m-control flex cursor-pointer items-start gap-3 rounded-control border p-3 ${isSelected
                                                        ? 'border-action/50 bg-accent-soft'
                                                        : 'border-separator bg-surface-raised/30 hover:border-control'
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
                                                    className="mt-1 shrink-0 accent-action"
                                                />
                                                <div>
                                                    <div className="text-sm font-medium text-ink">
                                                        {stack.name}
                                                        {stack.scope && (
                                                            <span className="ml-2 type-meta uppercase tracking-wide text-ink-muted">
                                                                {stack.scope}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {stack.description && (
                                                        <div className="text-xs text-ink-muted mt-0.5">{stack.description}</div>
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
                        <Card>
                            <CardContent className="space-y-4 p-6">
                                <div className="flex items-center gap-2">
                                    <Wand2 className="w-5 h-5 text-action" />
                                    <Label className="text-ink font-semibold">
                                        Quick Templates
                                    </Label>
                                </div>
                                <p className="text-xs text-ink-muted">
                                    Start with a template and customize it to your needs
                                </p>

                                <div className="space-y-2">
                                    {PERSONA_TEMPLATES.map((template) => (
                                        <button
                                            key={template.name}
                                            type="button"
                                            onClick={() => applyTemplate(template)}
                                            className="m-control flex w-full items-center gap-3 rounded-control border border-separator bg-surface/50 p-3 text-left hover:border-control hover:bg-surface-raised"
                                        >
                                            <div
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                                                style={{
                                                    backgroundColor: template.color,
                                                    color: readableTextOn(template.color),
                                                }}
                                            >
                                                <Bot className="h-4 w-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-ink truncate">
                                                    {template.name}
                                                </p>
                                                <p className="text-xs text-ink-muted truncate">
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
                <div className="mt-12 flex items-center justify-end gap-4 border-t border-separator pt-8">
                    <Button variant="ghost" onClick={routes.cancel}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        busy={creating}
                        busyLabel="Creating"
                        disabled={!persona.name.trim()}
                        className="px-8"
                    >
                        Create Persona
                    </Button>
                </div>
            </main>
        </div>
    );
}
