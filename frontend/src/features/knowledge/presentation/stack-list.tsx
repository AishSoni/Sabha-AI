"use client";

/**
 * Pure knowledge-stack collection presentation (spec-23).
 */
import Link from "next/link";
import {
    AlertTriangle,
    BookOpen,
    Loader2,
    Plus,
    Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import type { KnowledgeHrefs, KnowledgeStackView } from "./contract";

export interface StackListViewProps {
    stacks: KnowledgeStackView[];
    isLoading: boolean;
    isError: boolean;
    removePending?: boolean;
    removeError?: string | null;
    hrefs: KnowledgeHrefs;
    onDelete: (stackId: string) => void;
    /** Optional demo-tutorial anchor on the first stack link. */
    firstLinkRef?: (node: HTMLAnchorElement | null) => void;
}

export function StackListView({
    stacks,
    isLoading,
    isError,
    removePending,
    removeError,
    hrefs,
    onDelete,
    firstLinkRef,
}: StackListViewProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="type-section-title">Knowledge Stacks</h2>
                    <p className="type-body text-ink-secondary">
                        Saved document collections that participants can be assigned to.
                    </p>
                </div>
                <Link href={hrefs.createStack}>
                    <Button type="button" size="sm">
                        <Plus className="mr-1 size-4" />
                        New Stack
                    </Button>
                </Link>
            </div>

            {removeError && (
                <div role="alert" className="flex items-center gap-2 rounded-control border border-danger/40 bg-danger-soft px-3 py-2 type-body text-danger">
                    <AlertTriangle className="size-4" />
                    {removeError}
                </div>
            )}

            {isLoading && (
                <div className="flex items-center gap-2 type-meta text-ink-secondary">
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                    Loading stacks…
                </div>
            )}
            {isError && (
                <div role="alert" className="flex items-center gap-2 type-body text-danger">
                    <AlertTriangle className="size-4" />
                    Knowledge stacks are temporarily unavailable.
                </div>
            )}
            {!isLoading && !isError && stacks.length === 0 && (
                <Card className="border-dashed bg-surface-raised/40">
                    <CardContent className="py-10 text-center type-body text-ink-muted">
                        No stacks yet. Create one to group documents for a participant.
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                {stacks.map((stack, index) => (
                    <Card key={stack.id}>
                        <CardHeader className="flex flex-row items-start justify-between gap-3">
                            <div className="min-w-0">
                                <CardTitle className="flex items-center gap-2 truncate">
                                    <BookOpen className="size-4 text-ink-secondary" />
                                    {stack.name}
                                </CardTitle>
                                <CardDescription className="line-clamp-2">
                                    {stack.description || "No description"}
                                </CardDescription>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-danger hover:bg-danger-soft"
                                disabled={removePending}
                                onClick={() => onDelete(stack.id)}
                                aria-label={`Delete ${stack.name}`}
                            >
                                <Trash2 className="size-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                {stack.documentCount === undefined ? (
                                    <Badge variant="outline">Documents</Badge>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        <Badge variant="outline">
                                            {stack.documentCount} document
                                            {stack.documentCount === 1 ? "" : "s"}
                                        </Badge>
                                        <Badge variant="success">
                                            {stack.readyCount ?? 0} ready
                                        </Badge>
                                    </div>
                                )}
                                <Link
                                    ref={index === 0 ? firstLinkRef : undefined}
                                    href={hrefs.stack(stack.id)}
                                    className="m-control type-body text-action hover:underline"
                                >
                                    Open →
                                </Link>
                            </div>
                            {stack.assignedParticipantNames && (
                                <p className="type-meta text-ink-muted">
                                    {stack.assignedParticipantNames.length > 0
                                        ? `Assigned to ${stack.assignedParticipantNames.join(", ")}`
                                        : "No participant assigned"}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
