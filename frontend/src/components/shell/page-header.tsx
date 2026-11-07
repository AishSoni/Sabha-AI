import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps {
    title: ReactNode;
    description?: ReactNode;
    backHref?: string;
    backLabel?: string;
    meta?: ReactNode;
    actions?: ReactNode;
    headingId?: string;
    className?: string;
}

/**
 * The one contextual header for an application route. Global runtime chrome
 * lives in AppShell; features must not add a second sticky masthead.
 */
export function PageHeader({
    title,
    description,
    backHref,
    backLabel = "Back",
    meta,
    actions,
    headingId,
    className,
}: PageHeaderProps) {
    return (
        <header className={cn("border-b border-separator/80", className)}>
            <div className="mx-auto w-full max-w-6xl px-4 pb-6 pt-6 sm:px-6">
                {backHref ? (
                    <Link
                        href={backHref}
                        className="m-control mb-4 inline-flex min-h-9 items-center gap-2 rounded-control type-control text-ink-secondary outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        <ArrowLeft aria-hidden="true" className="size-4" />
                        {backLabel}
                    </Link>
                ) : null}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 flex-1">
                        {meta ? (
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                {meta}
                            </div>
                        ) : null}
                        <h1
                            id={headingId}
                            className="type-page-title text-balance text-ink"
                        >
                            {title}
                        </h1>
                        {description ? (
                            <div className="mt-2 max-w-[68ch] type-lead text-ink-secondary">
                                {description}
                            </div>
                        ) : null}
                    </div>
                    {actions ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {actions}
                        </div>
                    ) : null}
                </div>
            </div>
        </header>
    );
}
