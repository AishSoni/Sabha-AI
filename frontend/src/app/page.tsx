import Link from 'next/link';
import {
    ArrowRight,
    BookOpen,
    FileSearch,
    PlayCircle,
    RefreshCw,
    Sparkles,
} from 'lucide-react';

const FEATURES = [
    {
        icon: PlayCircle,
        title: 'A complete recorded meeting',
        body: 'Follow a prepared HDFC bond advisory session from the director’s opening question to the closing summary.',
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
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            <header className="sticky top-0 z-50 border-b border-zinc-800/50 backdrop-blur-sm">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600">
                            <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">Sabha</h1>
                            <p className="text-xs text-zinc-500">AI Advisory Board</p>
                        </div>
                    </div>
                    <nav className="flex items-center gap-4 text-sm">
                        <Link
                            href="/login"
                            className="text-zinc-500 transition-colors hover:text-zinc-200"
                        >
                            Operator
                        </Link>
                        <Link
                            href="/demo"
                            className="rounded-lg border border-indigo-800 px-3 py-1.5 text-indigo-300 transition-colors hover:bg-indigo-950/40"
                        >
                            Guided replay
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-6 py-16">
                <section className="mx-auto max-w-3xl text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-400">
                        Account-free replay
                    </p>
                    <h2 className="mt-4 text-4xl font-bold leading-tight text-white md:text-5xl">
                        See how an AI advisory board reasons together
                    </h2>
                    <p className="mt-5 text-lg text-zinc-400">
                        Walk through a recorded bond meeting with multiple AI
                        participants, live disagreement and consensus, grounded
                        evidence, and a closing summary.
                    </p>
                    <p className="mt-4 text-sm text-zinc-500">
                        Interactive replay of a recorded session. Live demonstration
                        available during interviews.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                        <Link
                            href="/demo"
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
                        >
                            Start guided replay
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link
                            href="/login"
                            className="text-sm text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-200 hover:underline"
                        >
                            Operator sign-in
                        </Link>
                    </div>
                </section>

                <section className="mt-20 grid gap-5 md:grid-cols-3">
                    {FEATURES.map(({ icon: Icon, title, body }) => (
                        <div
                            key={title}
                            className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"
                        >
                            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15">
                                <Icon className="h-5 w-5 text-indigo-300" />
                            </div>
                            <h3 className="font-semibold text-white">{title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                                {body}
                            </p>
                        </div>
                    ))}
                </section>

                <section className="mt-16 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8">
                    <div className="flex flex-wrap items-start justify-between gap-6">
                        <div className="max-w-xl">
                            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-emerald-300">
                                <BookOpen className="h-4 w-4" />
                                What the recorded journey covers
                            </div>
                            <p className="text-sm leading-relaxed text-zinc-400">
                                A credit analyst, a skeptical investor, and a
                                pragmatic CTO examine an HDFC bond opportunity.
                                The replay preserves their reasoning, the evidence
                                they cite, and the director’s decisions at each
                                checkpoint.
                            </p>
                        </div>
                        <Link
                            href="/demo"
                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-500"
                        >
                            Open the replay
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </section>

                <p className="mt-10 text-center text-xs text-zinc-600">
                    The live workspace is private and available only to the Sabha
                    operator.
                </p>
            </main>
        </div>
    );
}
