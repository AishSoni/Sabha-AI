'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, BookOpen, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Citation {
    source: string;
    title?: string;
    url?: string;
    snippet?: string;
}

interface CitationsBlockProps {
    citations: Citation[];
}

export function CitationsBlock({ citations }: CitationsBlockProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!citations || citations.length === 0) return null;

    return (
        <div className="my-2 rounded-lg bg-blue-950/30 border border-blue-800/50 overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-blue-400 hover:bg-blue-900/20 transition-colors"
            >
                <BookOpen className="w-4 h-4" />
                <span className="text-sm font-medium">
                    {citations.length} Source{citations.length !== 1 ? 's' : ''}
                </span>
                <div className="flex-1" />
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                ) : (
                    <ChevronRight className="w-4 h-4" />
                )}
            </button>

            {isExpanded && (
                <div className="px-3 pb-3 pt-1 space-y-2">
                    {citations.map((citation, idx) => (
                        <div key={idx} className="bg-black/20 rounded p-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-500 font-mono">[{idx + 1}]</span>
                                {citation.url ? (
                                    <a
                                        href={citation.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-blue-400 hover:underline flex items-center gap-1"
                                    >
                                        {citation.title || citation.source}
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                ) : (
                                    <span className="text-sm text-blue-300">
                                        {citation.title || citation.source}
                                    </span>
                                )}
                            </div>
                            {citation.snippet && (
                                <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                                    {citation.snippet}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
