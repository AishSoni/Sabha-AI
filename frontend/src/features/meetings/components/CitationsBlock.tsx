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

/**
 * A quiet source disclosure inside the contribution. The exact source preview
 * stays with the evidence host; this block only opens the citation list.
 */
export function CitationsBlock({ citations, renderPreviewAction }: CitationsBlockProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!citations || citations.length === 0) return null;

    return (
        <div className="my-2">
            <button
                type="button"
                data-tutorial-avoid
                onClick={() => setIsExpanded(!isExpanded)}
                aria-expanded={isExpanded}
                className="m-control inline-flex items-center gap-1.5 rounded-control py-0.5 type-meta font-medium text-ink-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
                <BookOpen className="size-3.5 text-action" aria-hidden="true" />
                <span>
                    {citations.length} Source{citations.length !== 1 ? 's' : ''}
                </span>
                {isExpanded ? (
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                ) : (
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                )}
            </button>

            {isExpanded ? (
                <div className="mt-2 space-y-2 border-l border-separator pl-3">
                    {citations.map((citation, idx) => (
                        <div key={idx} className="py-1">
                            <div className="flex items-center gap-2">
                                <span className="type-meta text-ink-muted">[{idx + 1}]</span>
                                {citation.url ? (
                                    <a
                                        href={citation.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 type-meta text-action hover:underline"
                                    >
                                        {citation.title || citation.source}
                                        <ExternalLink className="size-3" aria-hidden="true" />
                                    </a>
                                ) : (
                                    <span className="type-meta text-ink">
                                        {citation.title || citation.source}
                                    </span>
                                )}
                                {renderPreviewAction ? (
                                    <div className="ml-auto">
                                        {renderPreviewAction(citation)}
                                    </div>
                                ) : null}
                            </div>
                            <p className="mt-1 type-meta text-ink-muted">{citation.source}</p>
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
            ) : null}
        </div>
    );
}
