'use client';

/**
 * Thin route shell for the Knowledge stack collection. The feature owns the
 * server reads and deletion command; the URL stays /knowledge-stacks.
 */
import { StackList } from '@/features/knowledge';

export default function KnowledgeStacksPage() {
    return (
        <main id="main-content" tabIndex={-1}>
            <StackList />
        </main>
    );
}
