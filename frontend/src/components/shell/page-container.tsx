import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageContainer({
    children,
    className,
    width = "default",
}: {
    children: ReactNode;
    className?: string;
    width?: "default" | "wide" | "narrow";
}) {
    return (
        <div
            className={cn(
                "mx-auto w-full px-4 pb-20 pt-8 sm:px-6",
                width === "wide" && "max-w-7xl",
                width === "default" && "max-w-6xl",
                width === "narrow" && "max-w-3xl",
                className
            )}
        >
            {children}
        </div>
    );
}
