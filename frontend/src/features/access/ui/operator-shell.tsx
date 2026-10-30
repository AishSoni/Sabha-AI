"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
    { href: '/meetings', label: 'Meeting space' },
    { href: '/roster', label: 'AI roster' },
    { href: '/knowledge-stacks', label: 'Knowledge stacks' },
    { href: '/settings', label: 'Settings' },
];

export function OperatorShell({
    children,
    onLogout,
}: {
    children: React.ReactNode;
    onLogout: () => void;
}) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100">
            <header className="border-b border-neutral-800 bg-neutral-900/80">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                        Operator
                    </span>
                    <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm text-neutral-300">
                        {LINKS.map((link) => {
                            const active =
                                pathname === link.href ||
                                pathname.startsWith(`${link.href}/`);
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`rounded-md px-2.5 py-1.5 transition-colors ${
                                        active
                                            ? 'bg-neutral-800 text-white'
                                            : 'hover:bg-neutral-800/70 hover:text-white'
                                    }`}
                                >
                                    {link.label}
                                </Link>
                            );
                        })}
                    </nav>
                    <Link
                        href="/demo"
                        className="text-xs text-neutral-400 hover:text-neutral-200"
                    >
                        Guided replay
                    </Link>
                    <button
                        type="button"
                        onClick={onLogout}
                        className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500 hover:text-white"
                    >
                        Sign out
                    </button>
                </div>
            </header>
            {children}
        </div>
    );
}
