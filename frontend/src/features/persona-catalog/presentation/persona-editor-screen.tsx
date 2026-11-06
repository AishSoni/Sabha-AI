'use client';

/**
 * Persona editor shared by the operator roster and the demo workspace.
 *
 * The client, stack source, routes, and optional demo annotations are
 * injected. The screen keeps the base app's Overview/System Prompt tabs,
 * metadata save, immutable revision save, and activation command.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, Eye, Loader2, Save, History, Settings2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { readableTextOn } from '@/lib/readable-color';
import type { PersonaCatalogClient } from '../model/client';
import type { Persona, PersonaStackOption, PersonaUpdateInput, PromptRevision } from '../model/types';
import { normalizeStackIds, validatePersonaTemplate } from './validation';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];

export interface PersonaEditorRoutes {
    roster: string;
}

export interface PersonaEditorScreenProps {
    personaId: string;
    client: PersonaCatalogClient;
    loadStacks: () => Promise<PersonaStackOption[]>;
    routes: PersonaEditorRoutes;
    initialTab?: 'overview' | 'prompt';
    description?: string | null;
    revisionNotes?: Record<string, string>;
    revisionBadges?: Record<string, string>;
    historyNote?: string;
    /** Optional demo-tutorial hooks; the live screens leave these unset. */
    onTabChange?: (tab: string) => void;
    onViewRevision?: () => void;
    promptTabAnchor?: (node: HTMLButtonElement | null) => void;
    viewRevisionAnchor?: (node: HTMLButtonElement | null) => void;
}

export function PersonaEditorScreen({
    personaId,
    client,
    loadStacks,
    routes,
    initialTab = 'overview',
    description,
    revisionNotes,
    revisionBadges,
    historyNote,
    onTabChange,
    onViewRevision,
    promptTabAnchor,
    viewRevisionAnchor,
}: PersonaEditorScreenProps) {
    const id = personaId;

    const [persona, setPersona] = useState<Persona | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Editable form state
    const [name, setName] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [color, setColor] = useState('#6366f1');
    const [promptContent, setPromptContent] = useState('');
    const [promptVersions, setPromptVersions] = useState<PromptRevision[]>([]);
    const [promptDirty, setPromptDirty] = useState(false);
    const [availableStacks, setAvailableStacks] = useState<PersonaStackOption[]>([]);
    const [selectedStacks, setSelectedStacks] = useState<string[]>([]);

    // Revision inspection is deliberately separate from activation.
    const [viewedVersion, setViewedVersion] = useState<number | null>(null);
    const [pendingActivation, setPendingActivation] = useState<number | null>(null);
    const [leaveConfirm, setLeaveConfirm] = useState(false);
    const [announcement, setAnnouncement] = useState('');

    const promptRef = useRef('');
    const savingRef = useRef(false);
    const mountedRef = useRef(true);
    const loadTokenRef = useRef(0);
    const inspectorRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!promptDirty) return;
        const handler = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [promptDirty]);

    useEffect(() => {
        if (viewedVersion !== null) inspectorRef.current?.focus();
    }, [viewedVersion]);

    useEffect(() => {
        const token = ++loadTokenRef.current;
        savingRef.current = false;
        setSaving(false);
        setLoading(true);
        setPersona(null);
        setError(null);
        setViewedVersion(null);
        setPendingActivation(null);
        setLeaveConfirm(false);
        setAnnouncement('');
        Promise.all([client.get(id), client.listPromptVersions(id), loadStacks()])
            .then(([p, versions, stacks]) => {
                if (token !== loadTokenRef.current || !mountedRef.current) return;
                setPersona(p);
                setName(p.name);
                setSubtitle(p.subtitle || '');
                setColor(p.color);
                setPromptContent(p.active_prompt || '');
                promptRef.current = p.active_prompt || '';
                setPromptDirty(false);
                setPromptVersions(versions);
                setAvailableStacks(stacks);
                setSelectedStacks(p.stack_ids || []);
            })
            .catch((err) => {
                if (token === loadTokenRef.current && mountedRef.current) {
                    setError(err instanceof Error ? err.message : 'Failed to load persona');
                }
            })
            .finally(() => {
                if (token === loadTokenRef.current && mountedRef.current) setLoading(false);
            });
    }, [id, client, loadStacks]);

    async function handleSaveMetadata() {
        if (!persona || savingRef.current) return;
        const problems = validatePersonaTemplate({ name, subtitle, color });
        if (problems.length > 0) {
            setError(problems.join('; '));
            return;
        }

        const token = loadTokenRef.current;
        try {
            savingRef.current = true;
            setSaving(true);
            const update: PersonaUpdateInput = {
                name,
                subtitle,
                color,
                stack_ids: normalizeStackIds(selectedStacks),
            };
            const updated = await client.update(id, update);
            if (token !== loadTokenRef.current || !mountedRef.current) return;
            setPersona(updated);
            setAnnouncement('Persona settings saved.');
        } catch (err) {
            if (token === loadTokenRef.current && mountedRef.current) {
                setError(err instanceof Error ? err.message : 'Failed to save');
            }
        } finally {
            if (token === loadTokenRef.current) {
                savingRef.current = false;
                if (mountedRef.current) setSaving(false);
            }
        }
    }

    async function handleSavePrompt() {
        if (!persona || savingRef.current) return;

        const submitted = promptRef.current;
        const token = loadTokenRef.current;
        try {
            savingRef.current = true;
            setSaving(true);
            const saved = await client.createPromptVersion(id, submitted);
            if (token !== loadTokenRef.current || !mountedRef.current) return;
            // Serialized functional update: the saved revision becomes the
            // ONLY active one; overwriting based on a captured snapshot
            // would leave the previous revision flagged active.
            setPromptVersions((prev) => [
                saved,
                ...prev.filter((v) => v.id !== saved.id).map((v) => ({ ...v, is_active: false })),
            ]);
            setPersona((current) =>
                current
                    ? { ...current, active_prompt: submitted, active_prompt_version: saved.version }
                    : current
            );
            // Only clear the draft marker when the editor still holds the
            // submitted content. A later edit survives an earlier save.
            if (promptRef.current === submitted) setPromptDirty(false);
            setAnnouncement(`Saved version ${saved.version} and made it active.`);
        } catch (err) {
            if (token === loadTokenRef.current && mountedRef.current) {
                setError(err instanceof Error ? err.message : 'Failed to save prompt');
            }
        } finally {
            if (token === loadTokenRef.current) {
                savingRef.current = false;
                if (mountedRef.current) setSaving(false);
            }
        }
    }

    async function performActivation(version: number) {
        if (!persona || savingRef.current) return;
        const revision = promptVersions.find((v) => v.version === version);
        if (!revision) return;
        if (revision.is_active) {
            setViewedVersion(version);
            return;
        }

        const token = loadTokenRef.current;
        try {
            savingRef.current = true;
            setSaving(true);
            setPendingActivation(null);
            await client.activatePromptVersion(id, version);
            if (token !== loadTokenRef.current || !mountedRef.current) return;
            setPromptContent(revision.content);
            promptRef.current = revision.content;
            setPersona((current) =>
                current
                    ? { ...current, active_prompt: revision.content, active_prompt_version: version }
                    : current
            );
            // Serialized functional update: exactly one active revision.
            setPromptVersions((prev) =>
                prev.map((v) => ({
                    ...v,
                    is_active: v.version === version,
                }))
            );
            setPromptDirty(false);
            setViewedVersion(version);
            setAnnouncement(`Version ${version} is now active.`);
        } catch (err) {
            if (token === loadTokenRef.current && mountedRef.current) {
                setError(err instanceof Error ? err.message : 'Failed to activate version');
            }
        } finally {
            if (token === loadTokenRef.current) {
                savingRef.current = false;
                if (mountedRef.current) setSaving(false);
            }
        }
    }

    function requestActivation(version: number) {
        const revision = promptVersions.find((v) => v.version === version);
        if (!revision || revision.is_active || savingRef.current) return;
        if (promptDirty) {
            setPendingActivation(version);
            return;
        }
        void performActivation(version);
    }

    function viewRevision(version: number) {
        setViewedVersion(version);
        setAnnouncement(`Viewing version ${version}. The active version is unchanged.`);
    }

    const viewedRevision =
        viewedVersion === null
            ? null
            : promptVersions.find((revision) => revision.version === viewedVersion) ?? null;

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-canvas via-surface to-canvas">
                <Loader2 className="size-8 animate-spin text-ink-muted motion-reduce:animate-none" />
            </div>
        );
    }

    if (!persona) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-canvas via-surface to-canvas text-ink">
                <div className="text-center">
                    <h2 className="type-item-title mb-2">Persona Not Found</h2>
                    <Link href={routes.roster} className="text-action hover:underline">
                        Back to Roster
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-canvas via-surface to-canvas text-ink">
            {/* Header */}
            <header className="sticky top-0 z-chrome border-b border-separator bg-canvas/80 backdrop-blur-sm">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href={routes.roster}
                            className="text-ink-secondary hover:text-ink m-control"
                            aria-label="Back to roster"
                            onClick={(event) => {
                                if (!promptDirty) return;
                                event.preventDefault();
                                setLeaveConfirm(true);
                            }}
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-3">
                            <div
                                className="flex size-10 items-center justify-center rounded-full"
                                style={{
                                    backgroundColor: persona.color,
                                    color: readableTextOn(persona.color),
                                }}
                            >
                                <Bot className="size-5" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-ink">{persona.name}</h1>
                                {persona.subtitle && (
                                    <p className="text-xs text-ink-muted">{persona.subtitle}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main id="main-content" className="max-w-4xl mx-auto px-6 py-8" tabIndex={-1}>
                {description && (
                    <p className="text-sm text-ink-secondary mb-6 max-w-3xl">{description}</p>
                )}
                {error && (
                    <div role="alert" className="mb-6 rounded-group border border-danger/40 bg-danger-soft p-4">
                        <p className="type-body text-danger">{error}</p>
                    </div>
                )}

                <p role="status" aria-live="polite" className="text-xs text-success min-h-4 mb-4">
                    {announcement}
                </p>

                {leaveConfirm && (
                    <div
                        role="alertdialog"
                        aria-label="Unsaved system prompt"
                        className="mb-6 rounded-group border border-warning/40 bg-warning-soft p-4"
                    >
                        <p className="mb-3 type-body text-warning">
                            You have an unsaved system prompt draft. Leaving this page will discard it.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Link href={routes.roster}>
                                <Button variant="destructive" size="sm">
                                    Discard and leave
                                </Button>
                            </Link>
                            <Button variant="ghost" size="sm" autoFocus onClick={() => setLeaveConfirm(false)}>
                                Keep editing
                            </Button>
                        </div>
                    </div>
                )}

                {pendingActivation !== null && (
                    <div
                        role="alertdialog"
                        aria-label="Confirm revision activation"
                        className="mb-6 rounded-group border border-warning/40 bg-warning-soft p-4"
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') setPendingActivation(null);
                        }}
                    >
                        <p className="mb-3 type-body text-warning">
                            Activating version {pendingActivation} will replace the unsaved system prompt
                            in the editor. The draft will be discarded.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => void performActivation(pendingActivation)}
                            >
                                Discard draft and activate version {pendingActivation}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                autoFocus
                                onClick={() => setPendingActivation(null)}
                            >
                                Keep editing
                            </Button>
                        </div>
                    </div>
                )}

                <Tabs
                    defaultValue={initialTab}
                    onValueChange={onTabChange}
                    className="space-y-6"
                >
                    <TabsList>
                        <TabsTrigger value="overview">
                            <Settings2 className="mr-2 size-4" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger ref={promptTabAnchor} value="prompt">
                            <History className="mr-2 size-4" />
                            System Prompt
                        </TabsTrigger>
                    </TabsList>

                    {/* Overview Tab */}
                    <TabsContent value="overview">
                        <Card>
                            <CardHeader>
                                <CardTitle>Persona Settings</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-name">Name</Label>
                                    <Input
                                        id="edit-name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="edit-subtitle">Role / Subtitle</Label>
                                    <Input
                                        id="edit-subtitle"
                                        value={subtitle}
                                        onChange={(e) => setSubtitle(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Color</Label>
                                    <div className="flex gap-2">
                                        {COLORS.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                aria-label={`Select ${c}`}
                                                aria-pressed={color === c}
                                                className={`m-control size-8 rounded-full ${color === c
                                                    ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface'
                                                    : 'hover:ring-2 hover:ring-control hover:ring-offset-2 hover:ring-offset-surface'
                                                    }`}
                                                style={{ backgroundColor: c }}
                                                onClick={() => setColor(c)}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-3 pt-4 border-t border-separator">
                                    <div className="flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-action" />
                                        <Label className="text-ink text-base">Knowledge Stacks</Label>
                                    </div>
                                    <p className="text-xs text-ink-muted mb-2">
                                        Select document domains this AI can query during a meeting.
                                    </p>
                                    {availableStacks.length === 0 ? (
                                        <div className="text-sm text-ink-muted italic">No knowledge stacks created yet.</div>
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
                                </div>

                                <Button
                                    onClick={handleSaveMetadata}
                                    busy={saving}
                                    busyLabel="Saving"
                                    disabled={saving}
                                >
                                    <Save className="size-4" />
                                    Save Changes
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* System Prompt Tab */}
                    <TabsContent value="prompt">
                        <div className="grid gap-6 lg:grid-cols-3">
                            {/* Editor */}
                            <Card className="lg:col-span-2">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle>System Prompt</CardTitle>
                                    {persona.active_prompt_version && (
                                        <span className="text-xs text-ink-muted">
                                            v{persona.active_prompt_version}
                                        </span>
                                    )}
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <Textarea
                                        value={promptContent}
                                        onChange={(e) => {
                                            const next = e.target.value;
                                            setPromptContent(next);
                                            promptRef.current = next;
                                            setPromptDirty(true);
                                        }}
                                        placeholder="Define this persona's personality, expertise, and behavior..."
                                        className="min-h-[300px] font-mono text-sm"
                                    />

                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-ink-muted">
                                            {promptContent.length} characters
                                        </span>
                                        <Button
                                            onClick={handleSavePrompt}
                                            busy={saving}
                                            busyLabel="Saving version"
                                            disabled={saving || !promptDirty}
                                        >
                                            <Save className="size-4" />
                                            Save as New Version
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Version History */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>System Prompt Version History</CardTitle>
                                    {historyNote ? (
                                        <p className="type-meta leading-relaxed text-ink-muted">
                                            {historyNote}
                                        </p>
                                    ) : null}
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {promptVersions.length === 0 ? (
                                        <p className="text-sm text-ink-muted">No versions yet</p>
                                    ) : (
                                        promptVersions.map((v, index) => (
                                            <div
                                                key={v.id}
                                                className={`m-control w-full rounded-control border p-3 ${v.is_active
                                                    ? 'border-success/40 bg-success-soft'
                                                    : 'border-transparent bg-surface-raised/50'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm font-medium text-ink">
                                                        Version {v.version}
                                                    </span>
                                                    {v.is_active && (
                                                        <span className="text-xs text-success">Active</span>
                                                    )}
                                                </div>
                                                {revisionNotes?.[v.id] && (
                                                    <p className="text-xs text-ink-secondary mb-1">
                                                        {revisionNotes[v.id]}
                                                    </p>
                                                )}
                                                {revisionBadges?.[v.id] && (
                                                    <p className="type-meta uppercase tracking-wide text-warning/80 mb-1">
                                                        {revisionBadges[v.id]}
                                                    </p>
                                                )}
                                                <span className="text-xs text-ink-muted">
                                                    {new Date(v.created_at).toLocaleDateString()}
                                                </span>
                                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                                    <Button
                                                        ref={index === 0 ? viewRevisionAnchor : undefined}
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2 text-ink-secondary"
                                                        aria-label={`View version ${v.version}`}
                                                        onClick={() => {
                                                            onViewRevision?.();
                                                            viewRevision(v.version);
                                                        }}
                                                    >
                                                        <Eye className="w-3.5 h-3.5 mr-1" />
                                                        View revision
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 px-2"
                                                        aria-label={`Make version ${v.version} active`}
                                                        disabled={v.is_active || saving}
                                                        onClick={() => requestActivation(v.version)}
                                                    >
                                                        Make active
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {viewedRevision && (
                            <div
                                ref={inspectorRef}
                                tabIndex={-1}
                                aria-label={`Version ${viewedRevision.version} content`}
                                className="m-inspector mt-6 outline-none"
                            >
                                <Card>
                                    <CardHeader>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <CardTitle>
                                                Version {viewedRevision.version}
                                            </CardTitle>
                                            <span className="text-xs text-ink-muted">
                                                {viewedRevision.is_active
                                                    ? 'This revision is active.'
                                                    : 'Viewing only — not active.'}
                                            </span>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {revisionNotes?.[viewedRevision.id] && (
                                            <p className="text-xs text-ink-secondary">
                                                {revisionNotes[viewedRevision.id]}
                                            </p>
                                        )}
                                        <pre className="whitespace-pre-wrap break-words rounded-control border border-separator bg-canvas/60 p-4 font-mono text-sm text-ink-secondary">
                                            {viewedRevision.content}
                                        </pre>
                                        {!viewedRevision.is_active && (
                                            <Button
                                                size="sm"
                                                aria-label={`Activate version ${viewedRevision.version} from the revision view`}
                                                onClick={() => requestActivation(viewedRevision.version)}
                                                disabled={saving}
                                            >
                                                Make this version active
                                            </Button>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
