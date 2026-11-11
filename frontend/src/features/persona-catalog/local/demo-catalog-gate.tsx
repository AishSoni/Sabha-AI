'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useDemoWorkspace } from '@/features/demo-workspace';

/**
 * Keeps demo catalog routes closed when the workspace did not load.
 * The original guided journey stays available from the board.
 */
export function DemoCatalogGate({ children }: { children: ReactNode }) {
    const workspace = useDemoWorkspace();

    if (workspace.status === 'loading') {
        return (
            <main id="main-content" className="mx-auto max-w-4xl px-4 py-16 text-sm text-ink-secondary" tabIndex={-1}>
                Loading the demo workspace...
            </main>
        );
    }

    if (workspace.status !== 'ready') {
        return (
            <main id="main-content" className="mx-auto max-w-4xl px-4 py-16" tabIndex={-1}>
                <h1 className="text-xl font-semibold text-ink">
                    Personas unavailable
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                    {workspace.error ??
                        'This demo has no browser workspace. The board remains available.'}
                </p>
                <Link
                    href="/demo"
                    className="mt-6 inline-flex rounded-control border border-control px-4 py-2 text-sm text-ink hover:bg-surface-raised"
                >
                    Back to the demo board
                </Link>
            </main>
        );
    }

    return <>{children}</>;
}

