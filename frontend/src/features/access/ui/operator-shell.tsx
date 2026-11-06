"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AppearanceMenu } from '@/components/appearance';
import { Starfield } from '@/components/atmosphere';
import { Button } from '@/components/ui/button';

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
        <div className="relative isolate flex h-dvh min-h-0 flex-col bg-canvas text-ink">
            <Starfield />
            <header className="relative z-chrome shrink-0 border-b border-separator bg-surface/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
                    <span className="type-meta-strong uppercase tracking-[0.2em] text-action">
                        Operator
                    </span>
                    <nav className="flex flex-1 flex-wrap items-center gap-1 type-control">
                        {LINKS.map((link) => {
                            const active =
                                pathname === link.href ||
                                pathname.startsWith(`${link.href}/`);
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    aria-current={active ? 'page' : undefined}
                                    className={`rounded-control px-2.5 py-1.5 m-control ${
                                        active
                                            ? 'bg-surface-selected text-ink'
                                            : 'text-ink-secondary hover:bg-surface-raised hover:text-ink'
                                    }`}
                                >
                                    {link.label}
                                </Link>
                            );
                        })}
                    </nav>
                    <Link
                        href="/demo"
                        className="type-meta text-ink-muted m-control hover:text-ink-secondary"
                    >
                        Recorded demo
                    </Link>
                    <AppearanceMenu />
                    <Button type="button" variant="outline" size="sm" onClick={onLogout}>
                        Sign out
                    </Button>
                </div>
            </header>
            <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
    );
}
