'use client';

/**
 * Create or edit a Knowledge stack. The form is local UI state; the saved
 * record is server state owned by TanStack Query and keyed by stack id.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateStack, useStack, useUpdateStack } from '../api';

export interface StackEditorProps {
    stackId?: string;
}

export function StackEditor({ stackId }: StackEditorProps) {
    const existing = useStack(stackId ?? '');

    if (stackId && existing.isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading stack…
            </div>
        );
    }

    if (stackId && (existing.isError || !existing.data)) {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                <AlertTriangle className="h-4 w-4" />
                This stack is temporarily unavailable.
            </div>
        );
    }

    return (
        <StackForm
            key={existing.data?.id ?? 'new'}
            stackId={stackId}
            initialName={existing.data?.name ?? ''}
            initialDescription={existing.data?.description ?? ''}
        />
    );
}

interface StackFormProps {
    stackId?: string;
    initialName: string;
    initialDescription: string;
}

function StackForm({ stackId, initialName, initialDescription }: StackFormProps) {
    const router = useRouter();
    const create = useCreateStack();
    const update = useUpdateStack(stackId ?? '');
    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState(initialDescription);
    const [error, setError] = useState<string | null>(null);

    const editing = Boolean(stackId);
    const saving = create.isPending || update.isPending;

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setError(null);
        if (!name.trim()) {
            setError('A stack name is required.');
            return;
        }
        try {
            if (editing && stackId) {
                await update.mutateAsync({ name: name.trim(), description: description.trim() });
                router.push(`/knowledge-stacks/${stackId}`);
            } else {
                const stack = await create.mutateAsync({
                    name: name.trim(),
                    description: description.trim(),
                });
                router.push(`/knowledge-stacks/${stack.id}`);
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The stack could not be saved.');
        }
    }

    return (
        <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
                <CardTitle className="text-white">{editing ? 'Edit Stack' : 'New Knowledge Stack'}</CardTitle>
                <CardDescription>
                    Stack contents stay live: participants assigned to this stack see its currently eligible documents.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
                    <div className="space-y-2">
                        <label htmlFor="stack-name" className="text-sm font-medium text-zinc-200">
                            Name
                        </label>
                        <Input
                            id="stack-name"
                            value={name}
                            maxLength={100}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="e.g. Market research"
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="stack-description" className="text-sm font-medium text-zinc-200">
                            Description
                        </label>
                        <Textarea
                            id="stack-description"
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="What belongs in this stack?"
                            rows={4}
                        />
                    </div>
                    {(error || create.isError || update.isError) && (
                        <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                            <AlertTriangle className="h-4 w-4" />
                            {error ?? 'The stack could not be saved.'}
                        </div>
                    )}
                    <Button type="submit" disabled={saving}>
                        {saving ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="mr-1 h-4 w-4" />
                        )}
                        {editing ? 'Save changes' : 'Create stack'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
