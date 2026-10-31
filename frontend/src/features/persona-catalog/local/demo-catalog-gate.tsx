'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useDemoWorkspace } from '@/features/demo-workspace';

/**
 * Keeps practice catalog routes closed when the workspace did not load.
 * The original guided journey stays available from the board.
 */
export function DemoCatalogGate({ children }: { children: ReactNode }) {
    const workspace = useDemoWorkspace();

    if (workspace.status === 'loading') {
        return (
            <main className="mx-auto max-w-4xl px-4 py-16 text-sm text-zinc-400">
                Loading the practice workspace…
            </main>
        );
    }

    if (workspace.status !== 'ready') {
        return (
            <main className="mx-auto max-w-4xl px-4 py-16">
                <h1 className="text-xl font-semibold text-white">
                    Practice personas are unavailable
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                    {workspace.error ??
                        'This recording has no practice workspace. The prepared board and the guided journey are unchanged.'}
                </p>
                <Link
                    href="/demo"
                    className="mt-6 inline-flex rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                >
                    Back to the prepared board
                </Link>
            </main>
        );
    }

    return <>{children}</>;
}
