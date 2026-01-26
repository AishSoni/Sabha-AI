'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ToolUseBlockProps {
    toolName: string;
    arguments?: Record<string, unknown>;
    result?: string;
    isExecuting?: boolean;
}

export function ToolUseBlock({ toolName, arguments: args, result, isExecuting }: ToolUseBlockProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const toolDisplayName = toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    return (
        <div className="my-2 rounded-lg bg-amber-950/30 border border-amber-800/50 overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-amber-400 hover:bg-amber-900/20 transition-colors"
            >
                {isExecuting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : result ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                ) : (
                    <Wrench className="w-4 h-4" />
                )}
                <span className="text-sm font-medium">{toolDisplayName}</span>
                {isExecuting && (
                    <Badge variant="outline" className="text-xs border-amber-600 text-amber-500">
                        Running...
                    </Badge>
                )}
                <div className="flex-1" />
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                ) : (
                    <ChevronRight className="w-4 h-4" />
                )}
            </button>

            {isExpanded && (
                <div className="px-3 pb-3 pt-1 space-y-2">
                    {args && Object.keys(args).length > 0 && (
                        <div>
                            <p className="text-xs text-amber-500 uppercase tracking-wider mb-1">Arguments</p>
                            <pre className="text-xs text-amber-200/80 bg-black/30 rounded p-2 overflow-x-auto">
                                {JSON.stringify(args, null, 2)}
                            </pre>
                        </div>
                    )}
                    {result && (
                        <div>
                            <p className="text-xs text-green-500 uppercase tracking-wider mb-1">Result</p>
                            <p className="text-sm text-green-200/80">{result}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
