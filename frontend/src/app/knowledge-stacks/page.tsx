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
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            <header className="sticky top-0 z-50 border-b border-zinc-800/50 backdrop-blur-sm">
                <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
                    <Link href="/" className="text-zinc-400 transition-colors hover:text-white">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <h1 className="text-xl font-bold text-white">Knowledge</h1>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-6 py-8">
                <StackList />
            </main>
        </div>
    );
}
