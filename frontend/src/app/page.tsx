import Link from 'next/link';
import {
    ArrowRight,
    FileSearch,
    PlayCircle,
    RefreshCw,
    Sparkles,
} from 'lucide-react';
import { AppearanceMenu } from '@/components/appearance';

const FEATURES = [
    {
        icon: PlayCircle,
        title: 'A complete recorded meeting',
        body: 'Follow a prepared HDFC bond advisory session from the opening question to the closing summary.',
    },
    {
        icon: FileSearch,
        title: 'Evidence you can inspect',
        body: 'Open the citations behind each claim and read the retained source revision without leaving the room.',
    },
    {
        icon: RefreshCw,
        title: 'Restart or resume freely',
        body: 'Replay is account-free. Restart the journey, revisit a checkpoint, or reload the page at any time.',
    },
];

export default function HomePage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-canvas via-surface to-canvas">
            <header className="sticky top-0 z-chrome border-b border-separator bg-canvas/80 backdrop-blur-sm">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-group bg-gradient-to-br from-indigo-500 to-purple-600">
                            <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="type-item-title text-ink">Sabha</h1>
                            <p className="type-meta text-ink-muted">AI Advisory Board</p>
                        </div>
                    </div>
                    <nav className="flex items-center gap-3 type-control">
                        <AppearanceMenu />
                        <Link
                            href="/login"
                            className="m-control text-ink-muted hover:text-ink"
                        >
                            Operator
                        </Link>
                        <Link
                            href="/demo"
                            className="m-control rounded-control border border-control bg-surface/60 px-3 py-1.5 text-action hover:bg-accent-soft"
                        >
                            Recorded demo
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-6 py-16">
                <section className="mx-auto max-w-3xl text-center">
                    <p className="type-meta-strong uppercase tracking-[0.25em] text-action">
                        Account-free replay
                    </p>
                    <h2 className="type-display mt-4">
                        See how an AI advisory board reasons together
                    </h2>
                    <p className="mt-5 type-lead text-ink-secondary">
                        Walk through a prepared recorded bond meeting with multiple
                        AI participants, formal disagreement and consensus, grounded
                        evidence, and a closing summary.
                    </p>
                    <p className="mt-4 type-meta text-ink-muted">
                        Prepared demo · recorded responses, not live AI generation.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                        <Link
                            href="/demo"
                            className="m-control inline-flex items-center gap-2 rounded-control bg-action px-6 py-3 type-control font-semibold text-action-foreground hover:bg-action-hover"
                        >
                            Start the demo
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link
                            href="/login"
                            className="m-control type-control text-ink-secondary underline-offset-4 hover:text-ink hover:underline"
                        >
                            Operator sign-in
                        </Link>
                    </div>
                </section>

                <section className="mt-20 grid gap-5 md:grid-cols-3">
                    {FEATURES.map(({ icon: Icon, title, body }) => (
                        <div
                            key={title}
                            className="rounded-group border border-separator bg-surface-raised p-6"
                        >
                            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-control bg-accent-soft">
                                <Icon className="h-5 w-5 text-action" />
                            </div>
                            <h3 className="type-item-title text-ink">{title}</h3>
                            <p className="mt-2 type-body text-ink-secondary">
                                {body}
                            </p>
                        </div>
                    ))}
                </section>

                <p className="mt-10 text-center type-meta text-ink-muted">
                    The live workspace is private and available only to the Sabha
                    operator.
                </p>
            </main>
        </div>
    );
}
