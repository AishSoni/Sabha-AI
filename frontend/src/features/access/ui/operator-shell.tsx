"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppearanceMenu } from "@/components/appearance";
import { AppShell, type AppNavItem } from "@/components/shell";
import { Button } from "@/components/ui/button";

const LINKS: readonly AppNavItem[] = [
    { href: "/meetings", label: "Meetings" },
    { href: "/roster", label: "Personas" },
    { href: "/knowledge-stacks", label: "Knowledge" },
    { href: "/settings", label: "Settings", exact: true },
];

function isRoomPath(pathname: string): boolean {
    return /^\/meetings\/[^/]+$/.test(pathname);
}

export function OperatorShell({
    children,
    onLogout,
}: {
    children: React.ReactNode;
    onLogout: () => void;
}) {
    const pathname = usePathname();
    const room = isRoomPath(pathname);

    return (
        <AppShell
            homeHref="/meetings"
            runtimeLabel="Operator"
            navLabel="Operator workspace"
            items={LINKS}
            hideChrome={room}
            actions={
                <>
                    <Link
                        href="/demo"
                        className="m-control hidden min-h-9 items-center rounded-control px-2.5 type-control text-ink-secondary outline-none hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring xl:inline-flex"
                    >
                        Recorded demo
                    </Link>
                    <AppearanceMenu />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="hidden sm:inline-flex"
                        onClick={onLogout}
                    >
                        Sign out
                    </Button>
                </>
            }
            compactFooter={
                <div className="flex flex-col gap-1">
                    <Link
                        href="/demo"
                        className="m-control flex min-h-11 items-center rounded-control px-3 type-control text-ink-secondary hover:bg-surface-raised hover:text-ink"
                    >
                        Recorded demo
                    </Link>
                    <Button
                        type="button"
                        variant="outline"
                        className="justify-start"
                        onClick={onLogout}
                    >
                        Sign out
                    </Button>
                </div>
            }
        >
            {children}
        </AppShell>
    );
}
