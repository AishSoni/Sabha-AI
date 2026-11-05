'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
        <div className="my-2 overflow-hidden rounded-group border border-warning/40 bg-warning-soft">
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="m-control flex w-full items-center gap-2 px-3 py-2 text-warning hover:bg-warning/10"
            >
                {isExecuting ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : result ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                    <Wrench className="h-4 w-4" />
                )}
                <span className="text-sm font-medium">{toolDisplayName}</span>
                {isExecuting && (
                    <Badge variant="outline" className="border-warning text-warning">
                        Running...
                    </Badge>
                )}
                <div className="flex-1" />
                {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                ) : (
                    <ChevronRight className="h-4 w-4" />
                )}
            </button>

            {isExpanded && (
                <div className="space-y-2 px-3 pb-3 pt-1">
                    {args && Object.keys(args).length > 0 && (
                        <div>
                            <p className="mb-1 type-meta uppercase tracking-wider text-warning">Arguments</p>
                            <pre className="overflow-x-auto rounded-control bg-canvas/60 p-2 text-xs text-ink-secondary">
                                {JSON.stringify(args, null, 2)}
                            </pre>
                        </div>
                    )}
                    {result && (
                        <div>
                            <p className="mb-1 type-meta uppercase tracking-wider text-success">Result</p>
                            <p className="type-body text-ink-secondary">{result}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
