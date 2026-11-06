'use client';

/**
 * Thin route shell for creating a Knowledge stack. The feature owns the
 * create command and navigation after the server returns the stack.
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { StackEditor } from '@/features/knowledge';

export default function NewKnowledgeStackPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-canvas via-surface to-canvas text-ink">
            <header className="sticky top-0 z-chrome border-b border-separator bg-canvas/80 backdrop-blur-sm">
                <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
                    <Link href="/knowledge-stacks" aria-label="Back to knowledge stacks" className="m-control text-ink-secondary hover:text-ink">
                        <ArrowLeft className="size-5" />
                    </Link>
                    <div>
                        <h1 className="type-item-title">Create Knowledge Stack</h1>
                        <p className="type-meta text-ink-muted">Define a new collection for retrieval</p>
                    </div>
                </div>
            </header>
            <main id="main-content" className="mx-auto max-w-4xl px-6 py-8" tabIndex={-1}>
                <StackEditor />
            </main>
        </div>
    );
}
