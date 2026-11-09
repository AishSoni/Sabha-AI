'use client';

/**
 * Persona editor shared by the operator roster and the demo workspace.
 *
 * The client, stack source, routes, and optional demo annotations are
 * injected. The screen keeps the base app's Overview/System Prompt tabs,
 * metadata save, immutable revision save, and activation command.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save, History, Settings2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ParticipantMark } from '@/components/identity/participant-mark';
import type { PersonaCatalogClient } from '../model/client';
import type { Persona, PersonaStackOption, PersonaUpdateInput, PromptRevision } from '../model/types';
import { normalizeStackIds, validatePersonaTemplate } from './validation';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];

interface EditorBaseline {
    name: string;
    subtitle: string;
    color: string;
    stackKey: string;
    prompt: string;
}

type LeaveIntent =
    | { kind: 'link'; href: string }
    | { kind: 'history' };

function stackKey(stackIds: readonly string[] | null | undefined): string {
    return normalizeStackIds(stackIds).sort().join('\u0000');
}

type PersonaLoadError = {
    kind: 'not-found' | 'unavailable';
    message: string;
};

function failureStatus(error: unknown): number | null {
    if (typeof error !== 'object' || error === null) return null;
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : null;
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

function personaLoadError(error: unknown): PersonaLoadError {
    return failureStatus(error) === 404
        ? { kind: 'not-found', message: 'This persona may have been deleted or is not available to this workspace.' }
        : { kind: 'unavailable', message: errorMessage(error, 'The persona could not be loaded.') };
}

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
    /** Injectable navigation used after an explicit discard; defaults to a full page navigation. */
    navigate?: (href: string) => void;
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
    navigate = (href) => window.location.assign(href),
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
    const [loadError, setLoadError] = useState<PersonaLoadError | null>(null);
    const [personaRetryKey, setPersonaRetryKey] = useState(0);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [stacksError, setStacksError] = useState<string | null>(null);
    const [stacksLoading, setStacksLoading] = useState(false);

    // Editable form state
    const [name, setName] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [color, setColor] = useState('#6366f1');
    const [promptContent, setPromptContent] = useState('');
    const [promptVersions, setPromptVersions] = useState<PromptRevision[]>([]);
    const [availableStacks, setAvailableStacks] = useState<PersonaStackOption[]>([]);
    const [selectedStacks, setSelectedStacks] = useState<string[]>([]);
    const [stackAssignmentsKnown, setStackAssignmentsKnown] = useState(false);
    const [baseline, setBaseline] = useState<EditorBaseline | null>(null);

    // Revision inspection is deliberately separate from activation.
    const [viewedVersion, setViewedVersion] = useState<number | null>(null);
    const [pendingActivation, setPendingActivation] = useState<number | null>(null);
    const [leaveIntent, setLeaveIntent] = useState<LeaveIntent | null>(null);
    const [announcement, setAnnouncement] = useState('');

    const promptRef = useRef('');
    const savingRef = useRef(false);
    const mountedRef = useRef(true);
    const loadTokenRef = useRef(0);
    const historyTokenRef = useRef(0);
    const stacksTokenRef = useRef(0);
    const inspectorRef = useRef<HTMLDivElement | null>(null);
    const suppressGuardRef = useRef(false);
    const editorHrefRef = useRef('');

    const metadataDirty =
        baseline !== null &&
        (name !== baseline.name ||
            subtitle !== baseline.subtitle ||
            color !== baseline.color ||
            stackKey(selectedStacks) !== baseline.stackKey);
    const promptDirty = baseline !== null && promptContent !== baseline.prompt;
    const isDirty = metadataDirty || promptDirty;
    const dirtyRef = useRef(isDirty);
    dirtyRef.current = isDirty;

    useEffect(() => {
        mountedRef.current = true;
        editorHrefRef.current = window.location.href;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const loadHistory = useCallback(async () => {
        const token = ++historyTokenRef.current;
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const versions = await client.listPromptVersions(id);
            if (token !== historyTokenRef.current || !mountedRef.current) return;
            setPromptVersions(versions);
        } catch (err) {
            if (token !== historyTokenRef.current || !mountedRef.current) return;
            setHistoryError(errorMessage(err, 'Prompt history is unavailable.'));
        } finally {
            if (token === historyTokenRef.current && mountedRef.current) {
                setHistoryLoading(false);
            }
        }
    }, [client, id]);

    const loadStackOptions = useCallback(async () => {
        const token = ++stacksTokenRef.current;
        setStacksLoading(true);
        setStacksError(null);
        try {
            const stacks = await loadStacks();
            if (token !== stacksTokenRef.current || !mountedRef.current) return;
            setAvailableStacks(stacks);
        } catch (err) {
            if (token !== stacksTokenRef.current || !mountedRef.current) return;
            setStacksError(errorMessage(err, 'Knowledge stacks are unavailable.'));
        } finally {
            if (token === stacksTokenRef.current && mountedRef.current) {
                setStacksLoading(false);
            }
        }
    }, [loadStacks]);

    useEffect(() => {
        setPromptVersions([]);
        setAvailableStacks([]);
        setSelectedStacks([]);
        setStackAssignmentsKnown(false);
        setHistoryError(null);
        setStacksError(null);
    }, [id]);

    useEffect(() => {
        void loadHistory();
        return () => {
            historyTokenRef.current += 1;
        };
    }, [loadHistory]);

    useEffect(() => {
        void loadStackOptions();
        return () => {
            stacksTokenRef.current += 1;
        };
    }, [loadStackOptions]);

    useEffect(() => {
        const handler = (event: BeforeUnloadEvent) => {
            if (!dirtyRef.current || suppressGuardRef.current) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, []);

    useEffect(() => {
        const handler = () => {
            if (!dirtyRef.current || suppressGuardRef.current) return;
            // The browser has already moved to the previous entry. Restore
            // the editor URL in the current entry, then ask the director
            // whether the draft should be discarded.
            window.history.pushState(
                { ...(window.history.state ?? {}), personaEditorGuard: true },
                '',
                editorHrefRef.current
            );
            setLeaveIntent({ kind: 'history' });
        };
        window.addEventListener('popstate', handler);
        return () => window.removeEventListener('popstate', handler);
    }, []);

    useEffect(() => {
        const handler = (event: MouseEvent) => {
            if (!dirtyRef.current || suppressGuardRef.current || event.defaultPrevented) return;
            if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
            )
                return;
            const target = event.target;
            if (!(target instanceof Element)) return;
            const anchor = target.closest('a[href]');
            if (!(anchor instanceof HTMLAnchorElement)) return;
            if (anchor.target && anchor.target !== '_self') return;
            if (anchor.hasAttribute('download')) return;
            const href = anchor.getAttribute('href');
            if (!href || href.startsWith('#')) return;
            const url = new URL(anchor.href, window.location.href);
            if (url.origin !== window.location.origin) return;
            if (
                url.hash &&
                url.pathname === window.location.pathname &&
                url.search === window.location.search
            )
                return;
            event.preventDefault();
            event.stopPropagation();
            setLeaveIntent({
                kind: 'link',
                href: `${url.pathname}${url.search}${url.hash}`,
            });
        };
        document.addEventListener('click', handler, true);
        return () => document.removeEventListener('click', handler, true);
    }, []);

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
        setLoadError(null);
        setViewedVersion(null);
        setPendingActivation(null);
        setLeaveIntent(null);
        setBaseline(null);
        setSelectedStacks([]);
        setStackAssignmentsKnown(false);
        setAnnouncement('');
        suppressGuardRef.current = false;
        editorHrefRef.current = window.location.href;
        client
            .get(id)
            .then((p) => {
                if (token !== loadTokenRef.current || !mountedRef.current) return;
                const nextPrompt = p.active_prompt || '';
                setPersona(p);
                setName(p.name);
                setSubtitle(p.subtitle || '');
                setColor(p.color);
                setPromptContent(nextPrompt);
                promptRef.current = nextPrompt;
                setSelectedStacks(p.stack_ids || []);
                setStackAssignmentsKnown(Array.isArray(p.stack_ids));
                setBaseline({
                    name: p.name,
                    subtitle: p.subtitle || '',
                    color: p.color,
                    stackKey: stackKey(p.stack_ids || []),
                    prompt: nextPrompt,
                });
            })
            .catch((err) => {
                if (token === loadTokenRef.current && mountedRef.current) {
                    setLoadError(personaLoadError(err));
                }
            })
            .finally(() => {
                if (token === loadTokenRef.current && mountedRef.current) setLoading(false);
            });
    }, [id, client, personaRetryKey]);

    async function handleSaveMetadata() {
        if (!persona || savingRef.current) return;
        const problems = validatePersonaTemplate({ name, subtitle, color });
        if (problems.length > 0) {
            setError(problems.join('; '));
            return;
        }

        const token = loadTokenRef.current;
        const submitted = {
            name,
            subtitle,
            color,
            stackKey: stackKey(selectedStacks),
        };
        try {
            savingRef.current = true;
            setSaving(true);
            const update: PersonaUpdateInput = {
                name,
                subtitle,
                color,
            };
            // A stack-list failure must not erase assignments we never
            // managed to read. Only send stack_ids when the persona response
            // or an explicit edit gave us a known assignment set.
            if (stackAssignmentsKnown) {
                update.stack_ids = normalizeStackIds(selectedStacks);
            }
            const updated = await client.update(id, update);
            if (token !== loadTokenRef.current || !mountedRef.current) return;
            setPersona(updated);
            // Only advance the baseline for the submitted snapshot. Any
            // later edit remains dirty because the form still differs.
            setBaseline((current) =>
                current ? { ...current, ...submitted } : current
            );
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
            // Only advance the prompt baseline when the editor still holds
            // the submitted content. A later edit survives an earlier save.
            if (promptRef.current === submitted) {
                setBaseline((current) =>
                    current ? { ...current, prompt: submitted } : current
                );
            }
            setAnnouncement(`Saved and activated version ${saved.version}.`);
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
            setBaseline((current) =>
                current ? { ...current, prompt: revision.content } : current
            );
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

    function discardAndLeave() {
        if (!leaveIntent) return;
        const intent = leaveIntent;
        // Suppress both unload and popstate prompts while the explicit
        // discard navigation is in flight.
        suppressGuardRef.current = true;
        setLeaveIntent(null);
        if (intent.kind === 'link') {
            navigate(intent.href);
        } else {
            // The popstate handler restored the editor entry after the
            // browser moved back. One step now reaches the prior page.
            window.history.go(-1);
        }
    }

    const viewedRevision =
        viewedVersion === null
            ? null
            : promptVersions.find((revision) => revision.version === viewedVersion) ?? null;

    if (loading) {
        return (
            <div className="flex min-h-full items-center justify-center">
                <Loader2 className="size-8 animate-spin text-ink-muted motion-reduce:animate-none" />
            </div>
        );
    }

    if (!persona) {
        const unavailable = loadError?.kind === 'unavailable';
        return (
            <div className="flex min-h-full items-center justify-center px-6 text-ink">
                <div className="max-w-md text-center">
                    <h2 className="type-item-title mb-2">
                        {unavailable ? 'Persona Unavailable' : 'Persona Not Found'}
                    </h2>
                    <p className="mb-4 text-sm text-ink-secondary">
                        {unavailable
                            ? loadError?.message || 'The persona could not be loaded.'
                            : loadError?.message ||
                              'This persona may have been deleted or is not available to this workspace.'}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        {unavailable && (
                            <Button
                                variant="outline"
                                onClick={() => setPersonaRetryKey((key) => key + 1)}
                            >
                                Retry
                            </Button>
                        )}
                        <Link href={routes.roster} className="text-action hover:underline">
                            Back to Roster
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full text-ink">
            {/* Header */}
            <header className="material-chrome sticky top-0 z-chrome border-b border-separator">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href={routes.roster}
                            className="text-ink-secondary hover:text-ink m-control"
                            aria-label="Back to roster"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-3">
                            <ParticipantMark
                                participant={{
                                    id: markId ?? persona.id,
                                    name: persona.name,
                                    color: persona.color,
                                }}
                                size="md"
                            />
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

                <p id="persona-construction-note" className="mb-6 rounded-control border border-separator bg-surface-raised p-4 text-sm text-ink-secondary">
                    Changes apply when this persona is added to a new meeting. Existing meeting participants are unchanged; their captured identity, prompt, policy, and knowledge-stack assignments stay fixed. Eligible contents of an assigned knowledge stack may change future searches.
                </p>

                <p role="status" aria-live="polite" className="text-xs text-success min-h-4 mb-4">
                    {announcement}
                </p>

                {leaveIntent && (
                    <div
                        role="alertdialog"
                        aria-label="Unsaved changes"
                        className="mb-6 rounded-group border border-warning/40 bg-warning-soft p-4"
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') setLeaveIntent(null);
                        }}
                    >
                        <p className="mb-3 type-body text-warning">
                            You have unsaved persona changes. Leaving this page will discard them.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={discardAndLeave}
                            >
                                Discard changes and leave
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                autoFocus
                                onClick={() => setLeaveIntent(null)}
                            >
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
                                    <Label htmlFor="edit-subtitle">Role</Label>
                                    <Input
                                        id="edit-subtitle"
                                        value={subtitle}
                                        onChange={(e) => setSubtitle(e.target.value)}
                                    />
                                    <p className="text-xs text-ink-muted">
                                        Shown as the participant&apos;s role in a meeting.
                                    </p>
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
                                    {stacksError && (
                                        <div
                                            role="alert"
                                            className="rounded-control border border-warning/40 bg-warning-soft p-3"
                                        >
                                            <p className="text-sm text-warning">
                                                Knowledge stacks are unavailable. Your current
                                                assignments are preserved; retry to edit them.
                                            </p>
                                            <p className="mt-1 text-xs text-warning/90">{stacksError}</p>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="mt-2"
                                                onClick={() => void loadStackOptions()}
                                                busy={stacksLoading}
                                                busyLabel="Retrying"
                                            >
                                                Retry
                                            </Button>
                                        </div>
                                    )}
                                    {stacksLoading && availableStacks.length === 0 ? (
                                        <div className="text-sm text-ink-muted">Loading knowledge stacks...</div>
                                    ) : availableStacks.length === 0 ? (
                                        stacksError ? null : (
                                            <div className="text-sm text-ink-muted italic">No knowledge stacks created yet.</div>
                                        )
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
                                                                setStackAssignmentsKnown(true);
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
                                            busyLabel="Saving and activating"
                                            aria-describedby="persona-construction-note"
                                            disabled={saving || !promptDirty}
                                        >
                                            <Save className="size-4" />
                                            Save and activate new version
                                        </Button>
                                    </div>
                                    <p className="text-xs text-ink-muted">
                                        Saving creates a new revision and activates it for future
                                        meetings. Existing meeting participants keep their captured
                                        prompt.
                                    </p>
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
                                    {historyError && (
                                        <div
                                            role="alert"
                                            className="rounded-control border border-warning/40 bg-warning-soft p-3"
                                        >
                                            <p className="text-sm text-warning">
                                                Prompt history is unavailable. You can still edit
                                                and save the prompt.
                                            </p>
                                            <p className="mt-1 text-xs text-warning/90">{historyError}</p>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="mt-2"
                                                onClick={() => void loadHistory()}
                                                busy={historyLoading}
                                                busyLabel="Retrying"
                                            >
                                                Retry
                                            </Button>
                                        </div>
                                    )}
                                    {historyLoading && promptVersions.length === 0 ? (
                                        <p className="text-sm text-ink-muted">Loading version history...</p>
                                    ) : promptVersions.length === 0 ? (
                                        historyError ? null : (
                                            <p className="text-sm text-ink-muted">No versions yet</p>
                                        )
                                    ) : (
                                        promptVersions.map((v, index) => {
                                            const isViewed = viewedVersion === v.version;
                                            return (
                                                <div
                                                    key={v.id}
                                                    className={`relative w-full rounded-control border ${v.is_active
                                                        ? 'border-success/40 bg-success-soft'
                                                        : isViewed
                                                            ? 'border-action/50 bg-accent-soft/40'
                                                            : 'border-transparent bg-surface-raised/50'
                                                        }`}
                                                >
                                                    <button
                                                        type="button"
                                                        ref={index === 0 ? viewRevisionAnchor : undefined}
                                                        className="m-control block w-full rounded-control p-3 text-left outline-none transition-colors hover:bg-accent-soft/20 focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                                                        aria-label={`View version ${v.version}${v.is_active ? ', active' : ''}`}
                                                        aria-pressed={isViewed}
                                                        onClick={() => {
                                                            onViewRevision?.();
                                                            viewRevision(v.version);
                                                        }}
                                                    >
                                                        <div className="mb-1 flex items-center justify-between gap-2 pr-24">
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
                                                    </button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="absolute right-3 top-3 h-7 px-2"
                                                        aria-label={`Make version ${v.version} active`}
                                                        disabled={v.is_active || saving}
                                                        onClick={() => requestActivation(v.version)}
                                                    >
                                                        Make active
                                                    </Button>
                                                </div>
                                            );
                                        })
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
