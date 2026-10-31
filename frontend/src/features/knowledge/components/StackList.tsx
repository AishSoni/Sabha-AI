'use client';

/**
 * Knowledge stack collection. The live adapter owns server state; the shared
 * `StackListView` owns the presentation.
 */
import { useDeleteStack, useStacks } from '../api';
import { StackListView } from '../presentation/stack-list';

export interface StackListProps {
    userId?: string;
}

export function StackList({ userId }: StackListProps) {
    const stacks = useStacks(userId);
    const remove = useDeleteStack();

    async function handleDelete(stackId: string) {
        if (
            !window.confirm(
                'Delete this knowledge stack? Its documents will stop being eligible.'
            )
        ) {
            return;
        }
        try {
            await remove.mutateAsync(stackId);
        } catch {
            // The mutation error is rendered below.
        }
    }

    return (
        <StackListView
            stacks={stacks.data?.stacks ?? []}
            isLoading={stacks.isLoading}
            isError={stacks.isError}
            removePending={remove.isPending}
            removeError={
                remove.isError
                    ? remove.error instanceof Error
                        ? remove.error.message
                        : 'The stack could not be deleted.'
                    : null
            }
            hrefs={{
                createStack: '/knowledge-stacks/new',
                stack: (id) => `/knowledge-stacks/${id}`,
            }}
            onDelete={(id) => void handleDelete(id)}
        />
    );
}
