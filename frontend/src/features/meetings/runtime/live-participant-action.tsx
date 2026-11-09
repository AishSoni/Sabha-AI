"use client";

import { Bot, Clock } from "lucide-react";
import { RateLimitedButton } from "@/components/ui/rate-limited-button";
import { useSettingsStore } from "@/features/settings";
import { cn } from "@/lib/utils";
import type { ParticipantActionProps } from "./contract";
import { resolveEffectiveGeneration } from "./effective-generation";

/**
 * Live participant action (spec-14, spec-37).
 *
 * BYOK composition and provider cooldowns stay in the live runtime slot. The
 * effective configuration is resolved once from the participant's policy and
 * the browser-global choice, so execution, credential lookup, and cooldown
 * cannot disagree about the provider. The shared room never imports the vault
 * or the live cooldown store.
 */
export function LiveParticipantAction({
    participant,
    isActive,
    isQueued,
    disabled,
    onStart,
}: ParticipantActionProps) {
    const settingsState = useSettingsStore();
    const globalSettings = settingsState.composeGenerationSettings({ includeKey: false });
    const effective = resolveEffectiveGeneration(
        participant,
        globalSettings,
        (provider) => settingsState.getProviderApiKey(provider),
    );

    const start = () => {
        // Resolve again at click time: the vault may have locked or the user
        // may have changed the global provider since this render.
        const current = useSettingsStore.getState();
        const atClick = resolveEffectiveGeneration(
            participant,
            current.composeGenerationSettings({ includeKey: false }),
            (provider) => current.getProviderApiKey(provider),
        );
        onStart(atClick.settings);
    };

    return (
        <RateLimitedButton
            provider={effective.provider}
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
