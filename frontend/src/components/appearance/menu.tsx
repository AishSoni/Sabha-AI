"use client";

import { Monitor, Moon, Pause, Play, Sparkles, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import {
  useAppearanceOptional,
  type AppearancePreference,
  type BackgroundAnimation,
} from "./provider";

const OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const satisfies ReadonlyArray<{
  value: AppearancePreference;
  label: string;
  icon: typeof Monitor;
}>;

const BACKGROUND_OPTIONS = [
  { value: "on", label: "On", icon: Play },
  { value: "paused", label: "Paused", icon: Pause },
] as const satisfies ReadonlyArray<{
  value: BackgroundAnimation;
  label: string;
  icon: typeof Play;
}>;

export function AppearanceMenu({ className }: { className?: string }) {
  const appearance = useAppearanceOptional();
  if (!appearance) return null;
  const {
    preference,
    resolved,
    setPreference,
    resolvedBackgroundAnimation,
    reducedMotion,
    setBackgroundAnimation,
  } = appearance;
  const current = OPTIONS.find((option) => option.value === preference);
  const CurrentIcon = current?.icon ?? Monitor;
  const label = current?.label ?? "System";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("gap-2", className)}
          aria-label={`Appearance: ${label}`}
          title={`Appearance: ${label}`}
        >
          <CurrentIcon aria-hidden="true" />
          <span className="hidden sm:inline">Appearance</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) =>
            setPreference(value as AppearancePreference)
          }
        >
          {OPTIONS.map(({ value, label: optionLabel, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <span>{optionLabel}</span>
              {value === "system" ? (
                <span className="text-ink-muted type-meta ml-auto">
                  {resolved === "dark" ? "Dark" : "Light"}
                </span>
              ) : null}
              <Icon
                aria-hidden="true"
                className="text-ink-muted ml-auto size-4"
              />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <div className="my-1 h-px bg-separator" role="separator" />
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Background animation
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={resolvedBackgroundAnimation}
          onValueChange={(value) =>
            setBackgroundAnimation(value as BackgroundAnimation)
          }
        >
          {BACKGROUND_OPTIONS.map(({ value, label: optionLabel, icon: Icon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              disabled={value === "on" && reducedMotion}
            >
              <span>{optionLabel}</span>
              <Icon
                aria-hidden="true"
                className="text-ink-muted ml-auto size-4"
              />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {reducedMotion ? (
          <p className="px-2 pb-1.5 type-meta text-ink-muted">
            Paused by your reduced-motion setting.
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
