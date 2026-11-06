'use client';

/**
 * Thin route shell for one Knowledge stack. The feature owns fetching,
 * upload observation, and deletion; the URL stays /knowledge-stacks/[id].
 */
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentPanel, StackEditor, useStack } from '@/features/knowledge';

export default function KnowledgeStackDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const stackId = params.id as string;
    const stack = useStack(stackId);

    if (stack.isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-canvas via-surface to-canvas">
                <Loader2 className="size-8 animate-spin text-action motion-reduce:animate-none" />
            </div>
        );
    }

    if (stack.isError || !stack.data) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-canvas via-surface to-canvas p-6 text-center text-ink">
                <BookOpen className="mb-4 size-12 text-ink-muted" />
                <h2 className="mb-2 type-page-title">Stack Not Found</h2>
                <Button variant="outline" onClick={() => router.push('/knowledge-stacks')}>
                    Return to Knowledge Stacks
                </Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-canvas via-surface to-canvas text-ink">
            <header className="sticky top-0 z-chrome border-b border-separator bg-canvas/80 backdrop-blur-sm">
                <div className="mx-auto flex max-w-4xl flex-col justify-between gap-4 px-6 py-4 md:flex-row md:items-center">
                    <div className="flex items-center gap-4">
                        <Link href="/knowledge-stacks" aria-label="Back to knowledge stacks" className="m-control text-ink-secondary hover:text-ink">
                            <ArrowLeft className="size-5" />
                        </Link>
                        <div>
                            <div className="flex items-center gap-2">
                                <BookOpen className="size-5 text-action" />
                                <h1 className="type-item-title">{stack.data.name}</h1>
                            </div>
                            <p className="max-w-sm truncate type-meta text-ink-muted">
                                {stack.data.description || 'No description'}
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main id="main-content" className="mx-auto max-w-4xl space-y-6 px-6 py-8" tabIndex={-1}>
                <DocumentPanel
                    scope={{ stackId }}
                    title="Documents"
                    description="Uploads become eligible for assigned participants only after indexing is confirmed."
                />
                <StackEditor stackId={stackId} />
            </main>
        </div>
    );
}
