"use client";

/**
 * Pure knowledge-stack collection presentation (spec-23, spec-33).
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import {
    LoadingState,
    PageContainer,
    PageHeader,
} from "@/components/shell";
import type { KnowledgeHrefs, KnowledgeStackView } from "./contract";

export interface StackListViewProps {
    stacks: KnowledgeStackView[];
    isLoading: boolean;
    isError: boolean;
    removePending?: boolean;
    removeError?: string | null;
    hrefs: KnowledgeHrefs;
    onDelete: (stackId: string) => void;
    onRetry?: () => void;
    /** Optional demo-tutorial anchor on the first stack link. */
    firstLinkRef?: (node: HTMLAnchorElement | null) => void;
    disclosure?: ReactNode;
    title?: string;
    description?: string;
    backHref?: string;
    backLabel?: string;
}

export function StackListView({
    stacks,
    isLoading,
    isError,
    removePending,
    removeError,
    hrefs,
    onDelete,
    onRetry,
    firstLinkRef,
    disclosure,
    title = "Knowledge",
    description = "Saved document collections that can be assigned to personas or shared with a meeting.",
    backHref = "/meetings",
    backLabel = "Back to meetings",
}: StackListViewProps) {
    return (
        <>
            <PageHeader
                title={title}
                description={description}
                backHref={backHref}
                backLabel={backLabel}
                actions={
                    <Link
                        href={hrefs.createStack}
                        className="m-control inline-flex min-h-10 items-center gap-2 rounded-control bg-action px-4 type-control font-medium text-action-foreground outline-none hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        <Plus aria-hidden="true" className="size-4" />
                        New Stack
                    </Link>
                }
            />

            <PageContainer>
                {disclosure ? <div className="mb-5">{disclosure}</div> : null}
                {removeError ? (
                    <Notice tone="danger" className="mb-4">
                        {removeError}
                    </Notice>
                ) : null}

                {isLoading ? (
                    <LoadingState label="Loading knowledge stacks…" rows={4} />
                ) : isError ? (
                    <Notice
                        tone="warning"
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
                        Knowledge stacks are temporarily unavailable.
                    </Notice>
                ) : stacks.length === 0 ? (
                    <EmptyState
                        icon={<BookOpen className="size-6" />}
                        title="No knowledge stacks yet"
                        description="Create one to group documents for a persona or share them with a meeting."
                        action={
                            <Link href={hrefs.createStack}>
                                <Button>
                                    <Plus
                                        aria-hidden="true"
                                        className="size-4"
                                    />
                                    New Stack
                                </Button>
                            </Link>
                        }
                        className="material-raised rounded-group"
                    />
                ) : (
                    <section aria-labelledby="stacks-heading">
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                            <h2
                                id="stacks-heading"
                                className="type-section-title text-ink"
                            >
                                Knowledge stacks
                            </h2>
                            <span className="type-meta text-ink-muted">
                                {stacks.length}
                            </span>
                        </div>
                        <ul className="material-raised divide-y divide-separator overflow-hidden rounded-group">
                            {stacks.map((stack, index) => (
                                <li
                                    key={stack.id}
                                    data-testid={`knowledge-stack-${stack.id}`}
                                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <BookOpen
                                                aria-hidden="true"
                                                className="size-4 text-ink-muted"
                                            />
                                            <h3 className="type-item-title text-ink">
                                                {stack.name}
                                            </h3>
                                            {stack.scope ? (
                                                <Badge variant="outline">
                                                    {stack.scope === "shared"
                                                        ? "Shared"
                                                        : "Assigned"}
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <p className="mt-1 line-clamp-2 max-w-[68ch] type-body text-ink-secondary">
                                            {stack.description ||
                                                "No description"}
                                        </p>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 type-meta text-ink-muted">
                                            {stack.documentCount ===
                                            undefined ? (
                                                <span>Document count unavailable</span>
                                            ) : (
                                                <>
                                                    <span>
                                                        {stack.documentCount}{" "}
                                                        document
                                                        {stack.documentCount ===
                                                        1
                                                            ? ""
                                                            : "s"}
                                                    </span>
                                                    <span aria-hidden="true">
                                                        ·
                                                    </span>
                                                    <span>
                                                        {stack.readyCount ?? 0}{" "}
                                                        ready
                                                    </span>
                                                </>
                                            )}
                                            {stack.assignedParticipantNames ? (
                                                <>
                                                    <span aria-hidden="true">
                                                        ·
                                                    </span>
                                                    <span>
                                                        {stack
                                                            .assignedParticipantNames
                                                            .length > 0
                                                            ? `Assigned to ${stack.assignedParticipantNames.join(
                                                                  ", "
                                                              )}`
                                                            : "No persona assigned"}
                                                    </span>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <Link
                                            ref={
                                                index === 0
                                                    ? firstLinkRef
                                                    : undefined
                                            }
                                            href={hrefs.stack(stack.id)}
                                            className="m-control inline-flex min-h-9 items-center rounded-control border border-control bg-surface px-3 type-control text-ink outline-none hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                        >
                                            Open →
                                        </Link>
                                        <Button
                                            type="button"
                                            size="icon-sm"
                                            variant="ghost"
                                            className="text-danger hover:bg-danger-soft"
                                            disabled={removePending}
                                            onClick={() => onDelete(stack.id)}
                                            aria-label={`Delete ${stack.name}`}
                                        >
                                            <Trash2 aria-hidden="true" />
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </PageContainer>
        </>
    );
}
