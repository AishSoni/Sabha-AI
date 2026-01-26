'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThinkingBlockProps {
    content: string;
    isStreaming?: boolean;
}

export function ThinkingBlock({ content, isStreaming }: ThinkingBlockProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="my-2 rounded-lg bg-violet-950/30 border border-violet-800/50 overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-violet-400 hover:bg-violet-900/20 transition-colors"
            >
                <Brain className={cn("w-4 h-4", isStreaming && "animate-pulse")} />
                <span className="text-sm font-medium">Thinking</span>
                {isStreaming && (
                    <span className="text-xs text-violet-500 animate-pulse">...</span>
                )}
                <div className="flex-1" />
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                ) : (
                    <ChevronRight className="w-4 h-4" />
                )}
            </button>

            {isExpanded && (
                <div className="px-3 pb-3 pt-1">
                    <p className="text-sm text-violet-300/80 whitespace-pre-wrap font-mono">
                        {content}
                    </p>
                </div>
            )}
        </div>
    );
}
