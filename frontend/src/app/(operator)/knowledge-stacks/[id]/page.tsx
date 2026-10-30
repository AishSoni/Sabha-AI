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
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (stack.isError || !stack.data) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-6 text-center">
                <BookOpen className="mb-4 h-12 w-12 text-zinc-600" />
                <h2 className="mb-2 text-xl font-bold text-white">Stack Not Found</h2>
                <Button variant="outline" onClick={() => router.push('/knowledge-stacks')}>
                    Return to Knowledge Stacks
                </Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            <header className="sticky top-0 z-50 border-b border-zinc-800/50 backdrop-blur-sm">
                <div className="mx-auto flex max-w-4xl flex-col justify-between gap-4 px-6 py-4 md:flex-row md:items-center">
                    <div className="flex items-center gap-4">
                        <Link href="/knowledge-stacks" className="text-zinc-400 transition-colors hover:text-white">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <div>
                            <div className="flex items-center gap-2">
                                <BookOpen className="h-5 w-5 text-blue-500" />
                                <h1 className="text-xl font-bold text-white">{stack.data.name}</h1>
                            </div>
                            <p className="max-w-sm truncate text-xs text-zinc-500">
                                {stack.data.description || 'No description'}
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
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
