'use client';

import React from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useCooldown } from '@/stores/rateLimitStore';
import { cn } from '@/lib/utils';
import { type VariantProps } from 'class-variance-authority';

interface RateLimitedButtonProps
    extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
    provider: string;
    onRateLimitedClick?: () => void;
    isLoading?: boolean;
    loadingText?: string;
    showCountdown?: boolean;
    asChild?: boolean;
}

/**
 * A button that respects per-provider rate limits.
 * Shows a countdown timer when on cooldown.
 */
export function RateLimitedButton({
    provider,
    onRateLimitedClick,
    onClick,
    isLoading,
    loadingText,
    showCountdown = true,
    disabled,
    children,
    className,
    variant,
    size,
    asChild,
    ...props
}: RateLimitedButtonProps) {
    const { isOnCooldown, secondsRemaining, recordCall } = useCooldown(provider);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (isOnCooldown || isLoading || disabled) {
            e.preventDefault();
            return;
        }

        // Record the call to start cooldown
        recordCall();

        // Call the rate-limited click handler or standard onClick
        if (onRateLimitedClick) {
            onRateLimitedClick();
        } else if (onClick) {
            onClick(e);
        }
    };

    const isDisabled = disabled || isOnCooldown || isLoading;

    return (
        <Button
            variant={variant}
            size={size}
            asChild={asChild}
            className={cn(
                className,
                isOnCooldown && 'opacity-60 cursor-not-allowed'
            )}
            disabled={isDisabled}
            onClick={handleClick}
            {...props}
        >
            {isLoading ? (
                <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    {loadingText || children}
                </>
            ) : isOnCooldown && showCountdown ? (
                <>
                    <span className="inline-flex items-center justify-center w-5 h-5 mr-1.5 text-xs font-bold rounded-full bg-white/20">
                        {secondsRemaining}
                    </span>
                    {children}
                </>
            ) : (
                children
            )}
        </Button>
    );
}
