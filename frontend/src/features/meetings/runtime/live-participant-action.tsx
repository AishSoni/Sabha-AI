"use client";

import { Bot, Clock } from "lucide-react";
import { RateLimitedButton } from "@/components/ui/rate-limited-button";
import { useSettingsStore } from "@/features/settings";
import { cn } from "@/lib/utils";
import type { ParticipantActionProps } from "./contract";

/**
 * Live participant action (spec-14).
 *
 * BYOK composition and provider cooldowns stay in the live runtime slot. The
 * shared room only starts a turn with the settings this slot hands it, so the
 * replay graph never imports the vault or the live cooldown store.
 */
export function LiveParticipantAction({
    participant,
    isActive,
    isQueued,
    disabled,
    onStart,
}: ParticipantActionProps) {
    const start = () => {
        const settings =
            useSettingsStore.getState().composeGenerationSettings() ?? undefined;
        onStart(settings);
    };

    return (
        <RateLimitedButton
            provider={participant.provider_config?.provider || "default"}
            variant="outline"
            size="sm"
            disabled={disabled}
            onRateLimitedClick={start}
            isLoading={isActive}
            className={cn(isQueued && "border-dashed")}
            style={{
                borderColor: participant.color + "80",
                color: participant.color,
            }}
        >
            <Bot className="mr-1 size-4" />
            {participant.name.replace("The ", "")}
            {isQueued && <Clock className="ml-1 size-3 opacity-70" />}
        </RateLimitedButton>
    );
}
