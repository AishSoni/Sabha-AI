'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThinkingBlockProps {
    content: string;
    isStreaming?: boolean;
    provenance?: string;
}

/**
 * A quiet transcript disclosure. Recorded reasoning is a prepared artifact, so
 * the caller labels it "Reasoning (recorded)"; live reasoning never borrows that
 * label.
 */
export function ThinkingBlock({ content, isStreaming, provenance }: ThinkingBlockProps) {
    // Streaming starts expanded so live reasoning is visible immediately.
    const [isExpanded, setIsExpanded] = useState(Boolean(isStreaming));
    const label = provenance ?? 'Reasoning';

    return (
        <div className="my-2">
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-expanded={isExpanded}
                className="m-control inline-flex items-center gap-1.5 rounded-control py-0.5 type-meta font-medium text-ink-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
                <Sparkles
                    className={cn('size-3.5 text-action', isStreaming && 'animate-pulse motion-reduce:animate-none')}
                    aria-hidden="true"
                />
                <span>{label}</span>
                {isStreaming ? (
                    <span className="text-action" aria-hidden="true">
                        ...
                    </span>
                ) : null}
                {isExpanded ? (
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                ) : (
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                )}
            </button>

            {isExpanded ? (
                <div className="mt-2 border-l border-separator pl-3">
                    <p className="whitespace-pre-wrap type-meta text-ink-secondary">
                        {content}
                    </p>
                </div>
            ) : null}
        </div>
    );
}
