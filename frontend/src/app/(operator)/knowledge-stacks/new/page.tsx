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
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            <header className="sticky top-0 z-50 border-b border-zinc-800/50 backdrop-blur-sm">
                <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
                    <Link href="/knowledge-stacks" className="text-zinc-400 transition-colors hover:text-white">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-white">Create Knowledge Stack</h1>
                        <p className="text-xs text-zinc-500">Define a new collection for retrieval</p>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-4xl px-6 py-8">
                <StackEditor />
            </main>
        </div>
    );
}
