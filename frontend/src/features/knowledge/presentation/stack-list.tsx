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
                    <h2 className="text-xl font-bold text-white">Knowledge Stacks</h2>
                    <p className="text-sm text-zinc-400">
                        Saved document collections that participants can be assigned to.
                    </p>
                </div>
                <Link href={hrefs.createStack}>
                    <Button type="button" size="sm">
                        <Plus className="mr-1 h-4 w-4" />
                        New Stack
                    </Button>
                </Link>
            </div>

            {removeError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                    <AlertTriangle className="h-4 w-4" />
                    {removeError}
                </div>
            )}

            {isLoading && (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading stacks…
                </div>
            )}
            {isError && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    Knowledge stacks are temporarily unavailable.
                </div>
            )}
            {!isLoading && !isError && stacks.length === 0 && (
                <Card className="border-dashed border-zinc-800 bg-zinc-900/40">
                    <CardContent className="py-10 text-center text-sm text-zinc-500">
                        No stacks yet. Create one to group documents for a participant.
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                {stacks.map((stack, index) => (
                    <Card key={stack.id} className="border-zinc-800 bg-zinc-900/50">
                        <CardHeader className="flex flex-row items-start justify-between gap-3">
                            <div className="min-w-0">
                                <CardTitle className="flex items-center gap-2 truncate text-white">
                                    <BookOpen className="h-4 w-4 text-zinc-400" />
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
                                className="text-red-400 hover:text-red-300"
                                disabled={removePending}
                                onClick={() => onDelete(stack.id)}
                                aria-label={`Delete ${stack.name}`}
                            >
                                <Trash2 className="h-4 w-4" />
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
                                        <Badge
                                            variant="secondary"
                                            className="text-emerald-300"
                                        >
                                            {stack.readyCount ?? 0} ready
                                        </Badge>
                                    </div>
                                )}
                                <Link
                                    ref={index === 0 ? firstLinkRef : undefined}
                                    href={hrefs.stack(stack.id)}
                                    className="text-sm text-cyan-400 hover:text-cyan-300"
                                >
                                    Open →
                                </Link>
                            </div>
                            {stack.assignedParticipantNames && (
                                <p className="text-xs text-zinc-500">
                                    {stack.assignedParticipantNames.length > 0
                                        ? `Assigned to ${stack.assignedParticipantNames.join(", ")}`
                                        : "No practice participant assigned"}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
