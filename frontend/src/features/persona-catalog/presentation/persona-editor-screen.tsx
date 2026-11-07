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
import { Eye, Save, History, Settings2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ParticipantMark } from '@/components/identity/participant-mark';
import { LoadingState, PageContainer, PageHeader } from '@/components/shell';
import type { PersonaCatalogClient } from '../model/client';
import type { Persona, PersonaStackOption, PersonaUpdateInput, PromptRevision } from '../model/types';
import { normalizeStackIds, validatePersonaTemplate } from './validation';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];

export interface PersonaEditorRoutes {
    roster: string;
}

export interface PersonaEditorScreenProps {
    personaId: string;
    /** Stable identity used for the participant mark; falls back to the persona id. */
    markId?: string;
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
    markId,
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
            <main id="main-content" tabIndex={-1}>
                <PageContainer>
                    <LoadingState label="Loading persona…" rows={3} />
                </PageContainer>
            </main>
        );
    }

    if (!persona) {
        return (
            <main id="main-content" tabIndex={-1}>
                <PageHeader
                    title="Persona Not Found"
                    description="This persona is no longer available in the catalog."
                    backHref={routes.roster}
                    backLabel="Back to Roster"
                />
                <PageContainer>
                    <p className="type-body text-ink-secondary">
                        Return to the persona catalog to choose another
                        template.
                    </p>
                </PageContainer>
            </main>
        );
    }

    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title={persona.name}
                description={description ?? persona.subtitle}
                backHref={routes.roster}
                backLabel="Back to roster"
                onBackClick={(event) => {
                    if (!promptDirty) return;
                    event.preventDefault();
                    setLeaveConfirm(true);
                }}
                meta={
                    <>
                        <ParticipantMark
                            participant={{
                                id: markId ?? persona.id,
                                name: persona.name,
                                color: persona.color,
                            }}
                            size="sm"
                        />
                        <span className="type-meta text-ink-muted">
                            Persona template
                        </span>
                    </>
                }
            />

            <PageContainer>
                {error && (
                    <div role="alert" className="mb-6 rounded-group border border-danger/40 bg-danger-soft p-4">
                        <p className="type-body text-danger">{error}</p>
                    </div>
                )}

                <p role="status" aria-live="polite" className="mb-4 min-h-4 type-meta text-success">
                    {announcement}
                </p>

                <AlertDialog
                    open={leaveConfirm}
                    onOpenChange={setLeaveConfirm}
                >
                    <AlertDialogContent aria-label="Unsaved system prompt">
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Unsaved system prompt
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Leave with an unsaved prompt? Your unsaved
                                system prompt draft will be discarded. The
                                active revision is unchanged.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Keep editing</AlertDialogCancel>
                            <AlertDialogAction asChild>
                                <Link href={routes.roster}>
                                    Discard and leave
                                </Link>
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <AlertDialog
                    open={pendingActivation !== null}
                    onOpenChange={(open) => {
                        if (!open) setPendingActivation(null);
                    }}
                >
                    <AlertDialogContent aria-label="Confirm revision activation">
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Confirm revision activation
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Activating version {pendingActivation} will
                                replace the unsaved system prompt in the
                                editor. The draft will be discarded.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Keep editing</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => {
                                    if (pendingActivation !== null) {
                                        void performActivation(
                                            pendingActivation
                                        );
                                    }
                                }}
                            >
                                Discard draft and activate version{' '}
                                {pendingActivation}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

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
                        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
                            {/* Editor */}
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle>System Prompt</CardTitle>
                                        <p className="mt-1 type-meta text-ink-muted">
                                            Saving creates a new immutable
                                            revision and makes it active.
                                            Viewing an older revision never
                                            changes what is active.
                                        </p>
                                    </div>
                                    {persona.active_prompt_version && (
                                        <Badge variant="outline">
                                            Active v
                                            {persona.active_prompt_version}
                                        </Badge>
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
                                        className="min-h-[320px] resize-y type-body leading-relaxed"
                                    />

                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="type-meta text-ink-muted">
                                            {promptContent.length} characters
                                            {promptDirty
                                                ? ' · unsaved draft'
                                                : ''}
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
                                    <CardTitle>
                                        System Prompt Version History
                                    </CardTitle>
                                    {historyNote ? (
                                        <p className="type-meta leading-relaxed text-ink-muted">
                                            {historyNote}
                                        </p>
                                    ) : null}
                                </CardHeader>
                                <CardContent className="max-h-[34rem] space-y-2 overflow-y-auto">
                                    {promptVersions.length === 0 ? (
                                        <p className="type-body text-ink-muted">
                                            No versions yet
                                        </p>
                                    ) : (
                                        promptVersions.map((v, index) => (
                                            <div
                                                key={v.id}
                                                className={`m-control w-full rounded-control border p-3 ${
                                                    v.is_active
                                                        ? 'border-l-4 border-separator border-l-success'
                                                        : 'border-separator'
                                                }`}
                                            >
                                                <div className="mb-1 flex items-center justify-between">
                                                    <span className="type-control text-ink">
                                                        Version {v.version}
                                                    </span>
                                                    {v.is_active ? (
                                                        <Badge variant="outline">
                                                            Active
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                                {revisionNotes?.[v.id] && (
                                                    <p className="mb-1 type-meta text-ink-secondary">
                                                        {revisionNotes[v.id]}
                                                    </p>
                                                )}
                                                {revisionBadges?.[v.id] && (
                                                    <p className="mb-1 type-meta uppercase tracking-wide text-warning">
                                                        {revisionBadges[v.id]}
                                                    </p>
                                                )}
                                                <span className="type-meta text-ink-muted">
                                                    {new Date(
                                                        v.created_at
                                                    ).toLocaleDateString()}
                                                </span>
                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    <Button
                                                        ref={
                                                            index === 0
                                                                ? viewRevisionAnchor
                                                                : undefined
                                                        }
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-ink-secondary"
                                                        aria-label={`View version ${v.version}`}
                                                        onClick={() => {
                                                            onViewRevision?.();
                                                            viewRevision(
                                                                v.version
                                                            );
                                                        }}
                                                    >
                                                        <Eye className="size-3.5" />
                                                        View revision
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        aria-label={`Make version ${v.version} active`}
                                                        disabled={
                                                            v.is_active ||
                                                            saving
                                                        }
                                                        onClick={() =>
                                                            requestActivation(
                                                                v.version
                                                            )
                                                        }
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
                                                Version{' '}
                                                {viewedRevision.version}
                                            </CardTitle>
                                            <Badge variant="outline">
                                                {viewedRevision.is_active
                                                    ? 'Active revision'
                                                    : 'Viewing only · not active'}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {revisionNotes?.[viewedRevision.id] && (
                                            <p className="type-meta text-ink-secondary">
                                                {
                                                    revisionNotes[
                                                        viewedRevision.id
                                                    ]
                                                }
                                            </p>
                                        )}
                                        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-control border border-separator bg-canvas/60 p-4 type-body text-ink-secondary">
                                            {
                                                viewedRevision.content
                                            }
                                        </pre>
                                        {!viewedRevision.is_active && (
                                            <Button
                                                size="sm"
                                                aria-label={`Activate version ${viewedRevision.version} from the revision view`}
                                                onClick={() =>
                                                    requestActivation(
                                                        viewedRevision.version
                                                    )
                                                }
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
            </PageContainer>
        </main>
    );
}
