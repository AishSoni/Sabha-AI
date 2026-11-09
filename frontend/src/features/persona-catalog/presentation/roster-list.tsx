"use client";

/**
 * Roster presentation shared by the operator roster and the demo workspace.
 *
 * This module is data-shape agnostic: it receives already-decoded personas and
 * injected actions. It never imports a client, a hook, a route, or a store, so
 * a demo adapter can render exactly the same screen without live access.
 */
import Link from "next/link";
import {
    ArrowLeft,
    Bot,
    Copy,
    Loader2,
    MoreVertical,
    Plus,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ParticipantMark } from "@/components/identity/participant-mark";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface RosterPersonaView {
    id: string;
    /** Stable identity used for the participant mark; falls back to id. */
    markId?: string;
    name: string;
    subtitle?: string | null;
    description?: string | null;
    color: string;
    activePromptVersion?: number | null;
}

export interface RosterHrefs {
    home: string;
    create: string;
    persona: (personaId: string) => string;
}

export interface RosterListProps {
    personas: RosterPersonaView[];
    loading: boolean;
    error: string | null;
    hrefs: RosterHrefs;
    heading?: string;
    description?: string;
    backLabel?: string;
    highlightedPersonaId?: string;
    onDuplicate: (persona: RosterPersonaView) => void;
    onDelete: (personaId: string) => void;
    /** Optional anchor for the first persona card, supplied by the demo shell. */
    firstPersonaRef?: (node: HTMLDivElement | null) => void;
}

export function RosterList({
    personas,
    loading,
    error,
    hrefs,
    heading = "AI Roster",
    description = "Manage your AI personas",
    backLabel = "Back",
    highlightedPersonaId,
    onDuplicate,
    onDelete,
    firstPersonaRef,
}: RosterListProps) {
    return (
        <div className="min-h-full text-ink">
            <header className="material-chrome sticky top-0 z-chrome border-b border-separator">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href={hrefs.home}
                            className="text-ink-secondary hover:text-ink m-control"
                            aria-label={backLabel}
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-ink">{heading}</h1>
                            <p className="text-xs text-ink-muted">{description}</p>
                        </div>
                    </div>

                    <Link href={hrefs.create}>
                        <Button>
                            <Plus className="mr-2 size-4" />
                            Create Persona
                        </Button>
                    </Link>
                </div>
            </header>

            <main id="main-content" className="max-w-6xl mx-auto px-6 py-8" tabIndex={-1}>
                {error && (
                    <div role="alert" className="mb-8 rounded-group border border-danger/40 bg-danger-soft p-4">
                        <p className="type-body text-danger">{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="size-8 animate-spin text-ink-muted motion-reduce:animate-none" />
                    </div>
                ) : personas.length === 0 ? (
                    <div className="text-center py-20">
                        <Bot className="mx-auto mb-4 size-12 text-ink-muted" />
                        <h2 className="type-item-title mb-2">No Personas Yet</h2>
                        <p className="mb-6 type-body text-ink-secondary">
                            Create your first AI persona to get started.
                        </p>
                        <Link href={hrefs.create}>
                            <Button>
                                <Plus className="mr-2 size-4" />
                                Create Persona
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <>
                        <h2 className="mb-4 type-section-title">
                            Your Personas ({personas.length})
                        </h2>

                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {personas.map((persona, index) => (
                                <Card
                                    key={persona.id}
                                    ref={index === 0 ? firstPersonaRef : undefined}
                                    className="flex h-full flex-col transition-colors hover:border-action/40"
                                >
                                    <CardHeader className="pb-2">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex min-w-0 flex-1 items-start gap-3">
                                                <div className="mt-0.5 shrink-0">
                                                    <ParticipantMark
                                                        participant={{
                                                            id: persona.markId ?? persona.id,
                                                            name: persona.name,
                                                            color: persona.color,
                                                        }}
                                                        size="md"
                                                    />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <Link
                                                        href={hrefs.persona(persona.id)}
                                                        className="block"
                                                    >
                                                        <CardTitle className="cursor-pointer break-words transition-colors hover:text-action">
                                                            {persona.name}
                                                        </CardTitle>
                                                    </Link>
                                                    {persona.subtitle && (
                                                        <CardDescription
                                                            className="mt-1 line-clamp-2 break-words"
                                                            title={persona.subtitle}
                                                        >
                                                            {persona.subtitle}
                                                        </CardDescription>
                                                    )}
                                                    {highlightedPersonaId === persona.id && (
                                                        <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 type-meta font-medium text-action">
                                                            Start here
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="shrink-0"
                                                        aria-label={`Actions for ${persona.name}`}
                                                    >
                                                        <MoreVertical className="size-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent>
                                                    <DropdownMenuItem onClick={() => onDuplicate(persona)}>
                                                        <Copy className="mr-2 size-4" />
                                                        Duplicate
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => onDelete(persona.id)}
                                                        className="text-danger focus:bg-danger-soft focus:text-danger"
                                                    >
                                                        <Trash2 className="mr-2 size-4" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>
                                    {(persona.description || persona.activePromptVersion) && (
                                        <CardContent className="mt-auto pt-0">
                                            {persona.description && (
                                                <p
                                                    className="line-clamp-3 break-words type-body text-ink-muted"
                                                    title={persona.description}
                                                >
                                                    {persona.description}
                                                </p>
                                            )}
                                            {persona.activePromptVersion ? (
                                                <p className="mt-2 type-meta text-ink-muted">
                                                    Prompt v{persona.activePromptVersion}
                                                </p>
                                            ) : null}
                                        </CardContent>
                                    )}
                                </Card>
                            ))}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
