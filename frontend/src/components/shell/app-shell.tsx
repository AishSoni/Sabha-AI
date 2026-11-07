"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Starfield } from "@/components/atmosphere";
import { SabhaMark } from "@/components/brand/sabha-logo";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { useMediaQuery } from "./use-media-query";
import { RouteFocus } from "./route-focus";

export interface AppNavItem {
    href: string;
    label: string;
    /** Only mark the route itself active, not its children. */
    exact?: boolean;
    /** A real callback, attached to the one visible link. */
    registerNode?: (node: HTMLAnchorElement | null) => void;
}

export interface AppShellProps {
    children: ReactNode;
    homeHref: string;
    runtimeLabel: string;
    navLabel: string;
    items: readonly AppNavItem[];
    /** Inline actions for the wide header. */
    actions?: ReactNode;
    /** Extra destinations shown inside the compact navigation drawer. */
    compactFooter?: ReactNode;
    /** Optional notice/banner that belongs to the chrome. */
    banner?: ReactNode;
    /** The room owns its own header; the global navigation collapses. */
    hideChrome?: boolean;
    className?: string;
}

function isActive(pathname: string, item: AppNavItem): boolean {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({
    item,
    pathname,
    compact,
    onNavigate,
}: {
    item: AppNavItem;
    pathname: string;
    compact?: boolean;
    onNavigate?: () => void;
}) {
    const active = isActive(pathname, item);
    return (
        <Link
            ref={(node) => item.registerNode?.(node)}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
                "m-control relative flex items-center rounded-control type-control outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                compact
                    ? "min-h-11 border-l-2 px-3 py-2"
                    : "px-3 py-1.5",
                active
                    ? "bg-surface-selected text-ink"
                    : "text-ink-secondary hover:bg-surface-raised hover:text-ink",
                compact && (active ? "border-action" : "border-transparent")
            )}
        >
            <span>{item.label}</span>
            {active && !compact ? (
                <span
                    aria-hidden="true"
                    className="absolute inset-x-2 -bottom-[9px] h-0.5 rounded-full bg-action"
                />
            ) : null}
        </Link>
    );
}

export function AppShell({
    children,
    homeHref,
    runtimeLabel,
    navLabel,
    items,
    actions,
    compactFooter,
    banner,
    hideChrome = false,
    className,
}: AppShellProps) {
    const pathname = usePathname();
    const wide = useMediaQuery("(min-width: 1024px)");
    const [menuPath, setMenuPath] = useState<string | null>(null);
    const menuOpen = menuPath === pathname;

    return (
        <div
            className={cn("relative isolate min-h-dvh text-ink", className)}
            data-app-runtime={runtimeLabel}
        >
            <Starfield />
            <RouteFocus />
            {hideChrome ? null : (
                <header className="material-chrome sticky top-0 z-chrome border-b border-separator">
                    <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
                        <Link
                            href={homeHref}
                            className="m-control flex min-w-0 items-center gap-2 rounded-control text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                            aria-label={`${runtimeLabel} home`}
                        >
                            <SabhaMark
                                idPrefix={`shell-${runtimeLabel.replace(/\s+/g, "-").toLowerCase()}`}
                                className="h-6 w-6 shrink-0"
                            />
                            <span className="type-meta-strong uppercase tracking-[0.18em]">
                                Sabha
                            </span>
                        </Link>

                        <span
                            className={cn(
                                "inline-flex min-h-7 shrink-0 items-center rounded-full border px-2.5 type-meta-strong",
                                runtimeLabel === "Recorded demo"
                                    ? "border-warning/40 bg-warning-soft text-warning"
                                    : "border-control bg-surface-raised text-ink-secondary"
                            )}
                        >
                            {runtimeLabel}
                        </span>

                        {wide ? (
                            <nav
                                aria-label={navLabel}
                                className="ml-3 flex min-w-0 flex-1 items-center gap-1"
                            >
                                {items.map((item) => (
                                    <NavLink
                                        key={item.href}
                                        item={item}
                                        pathname={pathname}
                                    />
                                ))}
                            </nav>
                        ) : (
                            <div className="flex-1" />
                        )}

                        <div className="ml-auto flex shrink-0 items-center gap-1.5">
                            {actions}
                        </div>

                        {wide ? null : (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Open navigation"
                                aria-expanded={menuOpen}
                                onClick={() => setMenuPath(pathname)}
                            >
                                <Menu aria-hidden="true" />
                            </Button>
                        )}
                    </div>

                    {banner}

                    {wide ? null : (
                        <Dialog
                            open={menuOpen}
                            onOpenChange={(open) =>
                                setMenuPath(open ? pathname : null)
                            }
                        >
                            <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-sm p-5">
                                <DialogHeader>
                                    <DialogTitle>Navigation</DialogTitle>
                                    <DialogDescription>
                                        {runtimeLabel} sections and workspace actions.
                                    </DialogDescription>
                                </DialogHeader>
                                <nav
                                    aria-label={navLabel}
                                    className="flex flex-col gap-1"
                                >
                                    {items.map((item) => (
                                        <NavLink
                                            key={item.href}
                                            item={item}
                                            pathname={pathname}
                                            compact
                                            onNavigate={() =>
                                                setMenuPath(null)
                                            }
                                        />
                                    ))}
                                </nav>
                                {compactFooter ? (
                                    <div className="border-t border-separator pt-3">
                                        {compactFooter}
                                    </div>
                                ) : null}
                            </DialogContent>
                        </Dialog>
                    )}
                </header>
            )}
            <div
                className={cn(
                    "relative z-10",
                    hideChrome && "h-dvh min-h-0"
                )}
            >
                {children}
            </div>
        </div>
    );
}
