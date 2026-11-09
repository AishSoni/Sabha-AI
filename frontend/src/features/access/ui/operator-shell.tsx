"use client";

import {
    Library,
    LogOut,
    Menu,
    MessageSquare,
    Settings,
    Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AppearanceMenu } from '@/components/appearance';
import { Starfield } from '@/components/atmosphere';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const LINKS = [
    { href: '/meetings', label: 'Meeting space', icon: MessageSquare },
    { href: '/roster', label: 'AI roster', icon: Users },
    { href: '/knowledge-stacks', label: 'Knowledge stacks', icon: Library },
    { href: '/settings', label: 'Settings', icon: Settings },
];

export function OperatorShell({
    children,
    onLogout,
}: {
    children: React.ReactNode;
    onLogout: () => void;
}) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        // A completed navigation closes the sheet. A blocked navigation leaves
        // it open so the operator can choose another destination.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOpen(false);
    }, [pathname]);

    const handleLogout = () => {
        setOpen(false);
        onLogout();
    };

    return (
        <div className="relative isolate flex h-dvh min-h-0 flex-col text-ink">
            <Starfield />
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <button
                        type="button"
                        aria-label="Open Live navigation"
                        data-testid="live-nav-trigger"
                        className="material-chrome fixed top-1/2 left-0 z-chrome inline-flex min-h-11 -translate-y-1/2 items-center gap-1.5 rounded-r-control border border-l-0 border-separator px-2.5 py-2 type-meta-strong text-ink shadow-[var(--shadow-overlay)] outline-none hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring pointer-coarse:min-h-12"
                    >
                        <Menu className="h-4 w-4" aria-hidden="true" />
                        <span>Live</span>
                    </button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Live</DialogTitle>
                        <DialogDescription>
                            Move around the workspace. Unsaved work is checked
                            before you leave this screen.
                        </DialogDescription>
                    </DialogHeader>
                    <nav aria-label="Live navigation" className="flex flex-col gap-1">
                        {LINKS.map(({ href, label, icon: Icon }) => {
                            const active =
                                pathname === href ||
                                pathname.startsWith(`${href}/`);
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    aria-current={active ? 'page' : undefined}
                                    onClick={() => setOpen(false)}
                                    className={cn(
                                        'flex min-h-11 items-center gap-3 rounded-control px-3 py-2 type-control m-control outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                                        active
                                            ? 'bg-surface-selected text-ink'
                                            : 'text-ink-secondary hover:bg-surface-raised hover:text-ink'
                                    )}
                                >
                                    <Icon
                                        className="h-4 w-4 shrink-0"
                                        aria-hidden="true"
                                    />
                                    {label}
                                </Link>
                            );
                        })}
                    </nav>
                    <div className="flex items-center justify-between gap-3 border-t border-separator pt-4">
                        <span className="type-meta text-ink-secondary">
                            Appearance
                        </span>
                        <AppearanceMenu />
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleLogout}
                        className="w-full justify-start gap-2"
                    >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        Sign out
                    </Button>
                </DialogContent>
            </Dialog>
            <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
                {children}
            </div>
        </div>
    );
}
