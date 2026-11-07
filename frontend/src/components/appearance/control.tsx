"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

import { useAppearanceOptional, type AppearancePreference } from "./provider";

const OPTIONS = [
    { value: "system", label: "System", icon: Monitor },
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
] as const satisfies ReadonlyArray<{
    value: AppearancePreference;
    label: string;
    icon: typeof Monitor;
}>;

/**
 * Inline appearance control. Preference is memory-only and never written to
 * the server; the resolved system theme follows the OS.
 */
export function AppearanceControl({ className }: { className?: string }) {
    const appearance = useAppearanceOptional();
    if (!appearance) return null;
    const { preference, resolved, setPreference } = appearance;

    return (
        <fieldset className={cn("min-w-0", className)}>
            <legend className="type-control font-medium text-ink">
                Appearance
            </legend>
            <p className="mt-1 max-w-[68ch] type-body text-ink-secondary">
                Choose how Sabha looks in this browser. The preference stays in
                memory and is never saved to your account.
            </p>
            <div className="mt-3 grid max-w-md grid-cols-3 gap-2">
                {OPTIONS.map(({ value, label, icon: Icon }) => {
                    const selected = preference === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setPreference(value)}
                            className={cn(
                                "m-control flex min-h-12 flex-col items-center justify-center gap-1 rounded-control border px-2 py-2 type-control outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                                selected
                                    ? "border-action bg-surface-selected text-ink"
                                    : "border-separator bg-surface text-ink-secondary hover:bg-surface-raised hover:text-ink"
                            )}
                        >
                            <Icon aria-hidden="true" className="size-4" />
                            {label}
                            {value === "system" ? (
                                <span className="type-meta text-ink-muted">
                                    {resolved === "dark" ? "Dark" : "Light"}
                                </span>
                            ) : null}
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
}
