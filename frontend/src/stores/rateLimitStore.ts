'use client';

import { create } from 'zustand';

// Get rate limits from env (in seconds)
const getRateLimitSeconds = (provider: string): number => {
    const envKey = `NEXT_PUBLIC_RATE_LIMIT_${provider.toUpperCase()}`;
    const value = process.env[envKey];
    if (value) {
        return parseInt(value, 10);
    }
    // Fallback to default
    return parseInt(process.env.NEXT_PUBLIC_RATE_LIMIT_DEFAULT || '5', 10);
};

export type LLMProvider = 'gemini' | 'openrouter' | 'ollama' | 'anthropic' | 'default';

interface ProviderState {
    lastCallTime: number | null;
    cooldownUntil: number | null;
}

interface RateLimitState {
    providers: Record<string, ProviderState>;

    // Actions
    recordCall: (provider: string) => void;
    isOnCooldown: (provider: string) => boolean;
    getCooldownRemaining: (provider: string) => number;
    getRateLimitSeconds: (provider: string) => number;
}

export const useRateLimitStore = create<RateLimitState>((set, get) => ({
    providers: {},

    // Record that a call was made to a provider
    recordCall: (provider: string) => {
        const now = Date.now();
        const rateLimitMs = getRateLimitSeconds(provider) * 1000;
        const cooldownUntil = now + rateLimitMs;

        set((state) => ({
            providers: {
                ...state.providers,
                [provider]: {
                    lastCallTime: now,
                    cooldownUntil,
                },
            },
        }));
    },

    // Check if a provider is on cooldown
    isOnCooldown: (provider: string) => {
        const { providers } = get();
        const providerState = providers[provider];
        if (!providerState?.cooldownUntil) return false;
        return Date.now() < providerState.cooldownUntil;
    },

    // Get remaining cooldown in seconds
    getCooldownRemaining: (provider: string) => {
        const { providers } = get();
        const providerState = providers[provider];
        if (!providerState?.cooldownUntil) return 0;
        const remaining = Math.max(0, providerState.cooldownUntil - Date.now());
        return Math.ceil(remaining / 1000);
    },

    // Get rate limit seconds for a provider
    getRateLimitSeconds: (provider: string) => {
        return getRateLimitSeconds(provider);
    },
}));

// Hook for countdown timer that updates every second
import { useState, useEffect, useCallback } from 'react';

interface UseCooldownReturn {
    isOnCooldown: boolean;
    secondsRemaining: number;
    recordCall: () => void;
}

export function useCooldown(provider: string): UseCooldownReturn {
    const { recordCall: storeRecordCall, getCooldownRemaining, isOnCooldown: checkCooldown } = useRateLimitStore();
    const [secondsRemaining, setSecondsRemaining] = useState(0);
    const [isOnCooldown, setIsOnCooldown] = useState(false);

    // Update countdown every second
    useEffect(() => {
        const updateCooldown = () => {
            const remaining = getCooldownRemaining(provider);
            setSecondsRemaining(remaining);
            setIsOnCooldown(remaining > 0);
        };

        // Initial check
        updateCooldown();

        // Update every 100ms for smooth countdown
        const interval = setInterval(updateCooldown, 100);
        return () => clearInterval(interval);
    }, [provider, getCooldownRemaining]);

    const recordCall = useCallback(() => {
        storeRecordCall(provider);
        setSecondsRemaining(getRateLimitSeconds(provider));
        setIsOnCooldown(true);
    }, [provider, storeRecordCall]);

    return {
        isOnCooldown,
        secondsRemaining,
        recordCall,
    };
}
