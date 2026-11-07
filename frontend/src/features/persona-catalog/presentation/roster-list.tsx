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
    Bot,
    Copy,
    MoreVertical,
    Plus,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ParticipantMark } from "@/components/identity/participant-mark";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import {
    LoadingState,
    PageContainer,
    PageHeader,
} from "@/components/shell";

export interface RosterPersonaView {
    id: string;
    /** Stable identity used for the participant mark; falls back to id. */
    markId?: string;
    name: string;
    subtitle?: string | null;
    color: string;
    activePrompt?: string | null;
    activePromptVersion?: number | null;
    stackIds?: string[] | null;
    stackLabels?: string[] | null;
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
    highlightedPersonaId?: string;
    onDuplicate: (persona: RosterPersonaView) => void;
    onDelete: (personaId: string) => void;
    onRetry?: () => void;
}

export function RosterList({
    personas,
    loading,
    error,
    hrefs,
    heading = "Personas",
    description = "Manage the advisory participants available to your meetings.",
    highlightedPersonaId,
    onDuplicate,
    onDelete,
    onRetry,
}: RosterListProps) {
    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title={heading}
                description={description}
                backHref={hrefs.home}
                backLabel="Back to meetings"
                actions={
                    <Link
                        href={hrefs.create}
                        className="m-control inline-flex min-h-10 items-center gap-2 rounded-control bg-action px-4 type-control font-medium text-action-foreground outline-none hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        <Plus aria-hidden="true" className="size-4" />
                        Create Persona
                    </Link>
                }
            />

            <PageContainer>
                {error ? (
                    <Notice
                        tone="danger"
                        className="mb-5"
                        action={
                            onRetry ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={onRetry}
                                >
                                    Try again
                                </Button>
                            ) : undefined
                        }
                    >
                        {error}
                    </Notice>
                ) : null}

                {loading ? (
                    <LoadingState label="Loading personas…" rows={4} />
                ) : personas.length === 0 ? (
                    <EmptyState
                        icon={<Bot className="size-6" />}
                        title="No personas yet"
                        description="Create your first persona so it can participate in a meeting."
                        action={
                            <Link href={hrefs.create}>
                                <Button>
                                    <Plus
                                        aria-hidden="true"
                                        className="size-4"
                                    />
                                    Create Persona
                                </Button>
                            </Link>
                        }
                        className="material-raised rounded-group"
                    />
                ) : (
                    <section aria-labelledby="persona-list-heading">
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                            <h2
                                id="persona-list-heading"
                                className="type-section-title text-ink"
                            >
                                Your Personas ({personas.length})
                            </h2>
                        </div>
                        <ul className="material-raised divide-y divide-separator overflow-hidden rounded-group">
                            {personas.map((persona) => (
                                <li
                                    key={persona.id}
                                    data-testid={`persona-row-${persona.id}`}
                                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="flex min-w-0 items-start gap-3">
                                        <ParticipantMark
                                            participant={{
                                                id:
                                                    persona.markId ??
                                                    persona.id,
                                                name: persona.name,
                                                color: persona.color,
                                            }}
                                            size="md"
                                        />
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Link
                                                    href={hrefs.persona(
                                                        persona.id
                                                    )}
                                                    className="m-control rounded-control type-item-title text-ink outline-none hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                                >
                                                    {persona.name}
                                                </Link>
                                                {highlightedPersonaId ===
                                                    persona.id && (
                                                    <Badge variant="outline">
                                                        Start here
                                                    </Badge>
                                                )}
                                            </div>
                                            {persona.subtitle ? (
                                                <p className="type-meta text-ink-muted">
                                                    {persona.subtitle}
                                                </p>
                                            ) : null}
                                            <div className="mt-1 flex flex-wrap items-center gap-2 type-meta text-ink-muted">
                                                {persona.activePromptVersion ? (
                                                    <span>
                                                        Prompt v
                                                        {
                                                            persona.activePromptVersion
                                                        }
                                                    </span>
                                                ) : (
                                                    <span>
                                                        No active prompt
                                                        revision
                                                    </span>
                                                )}
                                                {persona.stackIds ? (
                                                    <>
                                                        <span aria-hidden="true">
                                                            ·
                                                        </span>
                                                        <span>
                                                            {persona
                                                                .stackIds
                                                                .length === 0
                                                                ? "No assigned knowledge"
                                                                : `${
                                                                      persona
                                                                          .stackIds
                                                                          .length
                                                                  } ${
                                                                      persona
                                                                          .stackIds
                                                                          .length ===
                                                                      1
                                                                          ? "assigned knowledge stack"
                                                                          : "assigned knowledge stacks"
                                                                  }`}
                                                        </span>
                                                    </>
                                                ) : null}
                                            </div>
                                            {persona.stackLabels &&
                                            persona.stackLabels.length > 0 ? (
                                                <p className="mt-1 line-clamp-1 type-meta text-ink-secondary">
                                                    {persona.stackLabels.join(
                                                        " · "
                                                    )}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                                        <Link
                                            href={hrefs.persona(persona.id)}
                                            className="m-control inline-flex min-h-9 items-center rounded-control border border-control bg-surface px-3 type-control text-ink outline-none hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                        >
                                            Open persona
                                        </Link>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label={`Actions for ${persona.name}`}
                                                >
                                                    <MoreVertical
                                                        aria-hidden="true"
                                                    />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        onDuplicate(persona)
                                                    }
                                                >
                                                    <Copy
                                                        aria-hidden="true"
                                                        className="mr-2 size-4"
                                                    />
                                                    Duplicate
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        onDelete(persona.id)
                                                    }
                                                    className="text-danger focus:bg-danger-soft focus:text-danger"
                                                >
                                                    <Trash2
                                                        aria-hidden="true"
                                                        className="mr-2 size-4"
                                                    />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </PageContainer>
        </main>
    );
}
