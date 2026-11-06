'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, BookOpen, ExternalLink } from 'lucide-react';

export interface CitationView {
    source: string;
    title?: string;
    url?: string;
    snippet?: string;
    claim_id?: string;
    locator?: string;
    document_id?: string;
    revision_id?: string;
    chunk_id?: string;
    chunk_index?: number;
    page_number?: number;
}

interface CitationsBlockProps {
    citations: CitationView[];
    renderPreviewAction?: (citation: CitationView) => ReactNode;
}

export function CitationsBlock({ citations, renderPreviewAction }: CitationsBlockProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!citations || citations.length === 0) return null;

    return (
        <div className="my-2 overflow-hidden rounded-group border border-action/40 bg-accent-soft">
            <button
                type="button"
                data-tutorial-avoid
                onClick={() => setIsExpanded(!isExpanded)}
                className="m-control flex w-full items-center gap-2 px-3 py-2 text-action hover:bg-action/10"
            >
                <BookOpen className="h-4 w-4" />
                <span className="text-sm font-medium">
                    {citations.length} Source{citations.length !== 1 ? 's' : ''}
                </span>
                <div className="flex-1" />
                {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                ) : (
                    <ChevronRight className="h-4 w-4" />
                )}
            </button>

            {isExpanded && (
                <div className="space-y-2 px-3 pb-3 pt-1">
                    {citations.map((citation, idx) => (
                        <div key={idx} className="rounded-control bg-surface/60 p-2">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-action">[{idx + 1}]</span>
                                {citation.url ? (
                                    <a
                                        href={citation.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-sm text-action hover:underline"
                                    >
                                        {citation.title || citation.source}
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                ) : (
                                    <span className="text-sm text-ink">
                                        {citation.title || citation.source}
                                    </span>
                                )}
                                {renderPreviewAction ? (
                                    <div className="ml-auto">
                                        {renderPreviewAction(citation)}
                                    </div>
                                ) : null}
                            </div>
                            <p className="mt-1 type-meta uppercase tracking-wide text-ink-muted">
                                {citation.source}
                            </p>
                            {citation.locator ? (
                                <p className="mt-1 type-meta text-ink-muted">
                                    Locator: {citation.locator}
                                </p>
                            ) : null}
                            {citation.snippet ? (
                                <p className="mt-1 whitespace-pre-wrap type-meta text-ink-secondary">
                                    {citation.snippet}
                                </p>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
