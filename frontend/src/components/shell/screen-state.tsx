"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingState({
    label = "Loading…",
    rows = 4,
    className,
}: {
    label?: string;
    rows?: number;
    className?: string;
}) {
    return (
        <div
            role="status"
            aria-live="polite"
            className={cn("flex flex-col gap-3", className)}
        >
            <span className="sr-only">{label}</span>
            {Array.from({ length: rows }, (_, index) => (
                <div
                    key={index}
                    aria-hidden="true"
                    className="material-raised flex items-center gap-4 rounded-group p-4"
                >
                    <Skeleton className="size-9 shrink-0 rounded-full" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-2/3" />
                    </div>
                    <Skeleton className="hidden h-8 w-20 sm:block" />
                </div>
            ))}
        </div>
    );
}

export function FetchErrorState({
    title = "This content could not be loaded",
    description,
    onRetry,
    retryLabel = "Try again",
    busy = false,
}: {
    title?: string;
    description?: ReactNode;
    onRetry?: () => void;
    retryLabel?: string;
    busy?: boolean;
}) {
    return (
        <div
            role="alert"
            className="material-raised flex flex-col items-start gap-3 rounded-group p-5"
        >
            <div className="flex items-center gap-2 type-item-title text-ink">
                <AlertTriangle aria-hidden="true" className="size-5 text-warning" />
                {title}
            </div>
            {description ? (
                <div className="type-body text-ink-secondary">{description}</div>
            ) : null}
            {onRetry ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    busy={busy}
                    busyLabel="Retrying"
                    onClick={onRetry}
                >
                    <RefreshCw aria-hidden="true" />
                    {retryLabel}
                </Button>
            ) : null}
        </div>
    );
}

export function ActionInProgress({ label }: { label: string }) {
    return (
        <span
            role="status"
            className="inline-flex items-center gap-1.5 type-meta text-ink-muted"
        >
            <Loader2
                aria-hidden="true"
                className="size-3.5 animate-spin motion-reduce:animate-none"
            />
            {label}
        </span>
    );
}

export function InlineError({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <p
            role="alert"
            className={cn(
                "rounded-control border border-danger/40 bg-danger-soft px-3 py-2 type-body text-danger",
                className
            )}
        >
            {children}
        </p>
    );
}
