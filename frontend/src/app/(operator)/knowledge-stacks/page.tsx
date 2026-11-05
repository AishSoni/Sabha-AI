'use client';

/**
 * Thin route shell for the Knowledge stack collection. The feature owns the
 * server reads and deletion command; the URL stays /knowledge-stacks.
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { StackList } from '@/features/knowledge';

export default function KnowledgeStacksPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-canvas via-surface to-canvas text-ink">
            <header className="sticky top-0 z-chrome border-b border-separator bg-canvas/80 backdrop-blur-sm">
                <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
                    <Link href="/" aria-label="Back to home" className="m-control text-ink-secondary hover:text-ink">
                        <ArrowLeft className="size-5" />
                    </Link>
                    <h1 className="type-item-title">Knowledge</h1>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-6 py-8">
                <StackList />
            </main>
        </div>
    );
}
