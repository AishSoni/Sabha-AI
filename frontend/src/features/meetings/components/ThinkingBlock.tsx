'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThinkingBlockProps {
    content: string;
    isStreaming?: boolean;
    provenance?: string;
}

export function ThinkingBlock({ content, isStreaming, provenance }: ThinkingBlockProps) {
    // Streaming starts expanded so live thinking is visible immediately.
    const [isExpanded, setIsExpanded] = useState(Boolean(isStreaming));
    return (
        <div className="my-2 overflow-hidden rounded-group border border-separator bg-surface-raised">
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="m-control flex w-full items-center gap-2 px-3 py-2 text-ink-secondary hover:bg-surface-selected"
            >
                <Brain className={cn('h-4 w-4 text-action', isStreaming && 'animate-pulse')} />
                <span className="text-sm font-medium">Thinking</span>
                {provenance && (
                    <span className="type-meta text-ink-muted">{provenance}</span>
                )}
                {isStreaming && (
                    <span className="text-xs text-action animate-pulse">...</span>
                )}
                <div className="flex-1" />
                {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                ) : (
                    <ChevronRight className="h-4 w-4" />
                )}
            </button>

            {isExpanded && (
                <div className="px-3 pb-3 pt-1">
                    <p className="whitespace-pre-wrap font-mono text-sm text-ink-secondary">
                        {content}
                    </p>
                </div>
            )}
        </div>
    );
}
