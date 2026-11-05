"use client";

import { Monitor, Moon, Sun } from "lucide-react";

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
  useAppearance,
  type AppearancePreference,
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

export function AppearanceMenu({ className }: { className?: string }) {
  const { preference, resolved, setPreference } = useAppearance();
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
      <DropdownMenuContent align="end" className="w-52">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
