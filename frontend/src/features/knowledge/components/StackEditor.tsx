'use client';

/**
 * Live stack editor. Server state, mutations, and navigation stay in this
 * adapter; the extracted form owns the shared presentation.
 */
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCreateStack, useStack, useUpdateStack } from '../api';
import { StackEditorView } from '../presentation/stack-editor';

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
    const editing = Boolean(stackId);
    const saving = create.isPending || update.isPending;

    return (
        <StackEditorView
            editing={editing}
            initialName={initialName}
            initialDescription={initialDescription}
            saving={saving}
            error={
                create.isError || update.isError
                    ? 'The stack could not be saved.'
                    : null
            }
            onSubmit={async (input) => {
                if (editing && stackId) {
                    await update.mutateAsync(input);
                    router.push(`/knowledge-stacks/${stackId}`);
                } else {
                    const stack = await create.mutateAsync(input);
                    router.push(`/knowledge-stacks/${stack.id}`);
                }
            }}
        />
    );
}
