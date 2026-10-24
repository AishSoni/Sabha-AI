'use client';

/**
 * Knowledge stack collection. Stack records are server state; deleting a
 * stack revokes its documents and retries physical cleanup on the backend.
 */
import Link from 'next/link';
import { BookOpen, Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDeleteStack, useStacks } from '../api';

export interface StackListProps {
    userId?: string;
}

export function StackList({ userId }: StackListProps) {
    const stacks = useStacks(userId);
    const remove = useDeleteStack();

    async function handleDelete(stackId: string) {
        if (!window.confirm('Delete this knowledge stack? Its documents will stop being eligible.')) {
            return;
        }
        try {
            await remove.mutateAsync(stackId);
        } catch {
            // The mutation error is rendered below.
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white">Knowledge Stacks</h2>
                    <p className="text-sm text-zinc-400">
                        Saved document collections that participants can be assigned to.
                    </p>
                </div>
                <Link href="/knowledge-stacks/new">
                    <Button type="button" size="sm">
                        <Plus className="mr-1 h-4 w-4" />
                        New Stack
                    </Button>
                </Link>
            </div>

            {remove.isError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                    <AlertTriangle className="h-4 w-4" />
                    {remove.error instanceof Error ? remove.error.message : 'The stack could not be deleted.'}
                </div>
            )}

            {stacks.isLoading && (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading stacks…
                </div>
            )}
            {stacks.isError && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    Knowledge stacks are temporarily unavailable.
                </div>
            )}
            {!stacks.isLoading && !stacks.isError && (stacks.data?.stacks.length ?? 0) === 0 && (
                <Card className="border-dashed border-zinc-800 bg-zinc-900/40">
                    <CardContent className="py-10 text-center text-sm text-zinc-500">
                        No stacks yet. Create one to group documents for a participant.
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                {(stacks.data?.stacks ?? []).map((stack) => (
                    <Card key={stack.id} className="border-zinc-800 bg-zinc-900/50">
                        <CardHeader className="flex flex-row items-start justify-between gap-3">
                            <div className="min-w-0">
                                <CardTitle className="flex items-center gap-2 truncate text-white">
                                    <BookOpen className="h-4 w-4 text-zinc-400" />
                                    {stack.name}
                                </CardTitle>
                                <CardDescription className="line-clamp-2">
                                    {stack.description || 'No description'}
                                </CardDescription>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-red-400 hover:text-red-300"
                                disabled={remove.isPending}
                                onClick={() => void handleDelete(stack.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between">
                            <Badge variant="outline">Documents</Badge>
                            <Link href={`/knowledge-stacks/${stack.id}`} className="text-sm text-cyan-400 hover:text-cyan-300">
                                Open →
                            </Link>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
