'use client';

/**
 * Thin route shell for one Knowledge stack. The feature owns fetching,
 * upload observation, and deletion; the URL stays /knowledge-stacks/[id].
 */
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Users } from 'lucide-react';
import { DocumentPanel, StackEditor, useStack } from '@/features/knowledge';
import {
    LoadingState,
    PageContainer,
    PageHeader,
} from '@/components/shell';

export default function KnowledgeStackDetailsPage() {
    const params = useParams();
    const stackId = params.id as string;
    const stack = useStack(stackId);

    if (stack.isLoading) {
        return (
            <main id="main-content" tabIndex={-1}>
                <PageContainer>
                    <LoadingState label="Loading knowledge stack…" rows={3} />
                </PageContainer>
            </main>
        );
    }

    if (stack.isError || !stack.data) {
        return (
            <main id="main-content" tabIndex={-1}>
                <PageHeader
                    title="Stack Not Found"
                    description="This knowledge stack is no longer available."
                    backHref="/knowledge-stacks"
                    backLabel="Back to Knowledge"
                />
                <PageContainer>
                    <Link
                        href="/knowledge-stacks"
                        className="m-control inline-flex min-h-10 items-center rounded-control border border-control bg-surface px-4 type-control text-ink hover:bg-surface-raised"
                    >
                        Return to Knowledge Stacks
                    </Link>
                </PageContainer>
            </main>
        );
    }

    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title={stack.data.name}
                description={
                    stack.data.description ||
                    'A document collection available to assigned personas.'
                }
                backHref="/knowledge-stacks"
                backLabel="Back to Knowledge"
                meta={
                    <>
                        <BookOpen
                            aria-hidden="true"
                            className="size-4 text-ink-muted"
                        />
                        <span className="type-meta text-ink-muted">
                            Knowledge stack
                        </span>
                    </>
                }
            />

            <PageContainer>
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                    <div className="min-w-0 space-y-6">
                        <DocumentPanel
                            scope={{ stackId }}
                            title="Documents"
                            description="Uploads become eligible for assigned participants only after indexing is confirmed."
                        />
                        <section className="material-raised rounded-group border border-separator p-5">
                            <div className="flex items-center gap-2">
                                <Users
                                    aria-hidden="true"
                                    className="size-4 text-ink-muted"
                                />
                                <h2 className="type-section-title text-ink">
                                    Access
                                </h2>
                            </div>
                            <p className="mt-2 max-w-[68ch] type-body text-ink-secondary">
                                A persona can use this stack when it is
                                assigned in the persona editor. Meeting-shared
                                files are a separate scope and do not appear in
                                this stack.
                            </p>
                            <Link
                                href="/roster"
                                className="m-control mt-3 inline-flex min-h-9 items-center rounded-control type-control text-action hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                            >
                                Review persona assignments
                            </Link>
                        </section>
                    </div>
                    <aside className="min-w-0">
                        <StackEditor stackId={stackId} />
                    </aside>
                </div>
            </PageContainer>
        </main>
    );
}
