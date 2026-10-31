import Link from "next/link";

export const metadata = {
    title: "Demo settings · Sabha",
};

export default function DemoSettingsPage() {
    return (
        <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
            <div className="mx-auto max-w-3xl space-y-8">
                <header className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">
                        Demo workspace
                    </p>
                    <h1 className="text-3xl font-semibold text-white">
                        Settings in the public demo
                    </h1>
                    <p className="text-sm leading-6 text-zinc-400">
                        This page explains what the demo can and cannot configure.
                        It is served without operator sign-in and never reads a
                        credential, a vault entry, or a provider connection.
                    </p>
                </header>

                <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                    <h2 className="text-lg font-semibold text-white">
                        Provider setup is operator-only
                    </h2>
                    <p className="text-sm leading-6 text-zinc-400">
                        Model providers, API keys, vault access, and test-connection
                        actions are available only inside the authenticated operator
                        workspace. The demo has no key fields, no reveal action, and
                        no connected state to fake. Recorded participant replies come
                        from the prepared package and are not generated in this
                        browser.
                    </p>
                </section>

                <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                    <h2 className="text-lg font-semibold text-white">
                        Preferences unavailable in the demo
                    </h2>
                    <p className="text-sm leading-6 text-zinc-400">
                        Appearance, Notifications, and Privacy preferences remain
                        operator-only. The demo does not persist a theme, a
                        notification choice, or a privacy setting, and it does not
                        write to localStorage, sessionStorage, IndexedDB, cookies, or
                        a service worker.
                    </p>
                </section>

                <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                    <h2 className="text-lg font-semibold text-white">
                        Workspace lifetime and provenance
                    </h2>
                    <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-400">
                        <li>
                            Practice edits live in this browser tab and disappear on
                            refresh or when you choose <strong>Reset demo</strong>.
                        </li>
                        <li>
                            <strong>Restart recording</strong> resets playback and the
                            guide bookmark only; practice edits remain.
                        </li>
                        <li>
                            Recorded turns and their evidence are prepared content.
                            Historical dates are the recording&apos;s dates, not
                            today&apos;s research.
                        </li>
                        <li>
                            Information as of 31 July 2020 · sources captured 16
                            October 2026.
                        </li>
                    </ul>
                </section>

                <div className="flex flex-wrap gap-3">
                    <Link
                        href="/demo"
                        className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white"
                    >
                        Back to the board
                    </Link>
                    <Link
                        href="/demo/new"
                        className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                    >
                        Start the recorded meeting
                    </Link>
                </div>
            </div>
        </main>
    );
}
