"use client";

/**
 * Reusable preview triggers. Both resolve through the room's evidence adapter
 * and open the shared host; neither renders when no evidence can be resolved.
 */

import * as React from "react";
import { Eye, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    EvidenceCitationRef,
    EvidenceDescriptor,
    citationContext,
} from "./contract";
import { useEvidencePreview } from "./provider";

export interface EvidenceTriggerProps {
    descriptor: EvidenceDescriptor;
    citation?: EvidenceCitationRef | null;
    label?: string;
    className?: string;
}

export function EvidenceTrigger({
    descriptor,
    citation,
    label = "Preview",
    className,
}: EvidenceTriggerProps) {
    const { open } = useEvidencePreview();
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className={className}
            aria-label={`Preview evidence: ${descriptor.title}`}
            onClick={() => open(descriptor, citationContext(citation))}
        >
            <Eye className="size-3.5" />
            {label}
        </Button>
    );
}

function citationKey(citation: EvidenceCitationRef): string {
    return [
        citation.claim_id ?? "",
        citation.document_id ?? "",
        citation.revision_id ?? "",
        citation.chunk_id ?? "",
        citation.source ?? "",
        citation.title ?? "",
        citation.url ?? "",
    ].join("\u0000");
}

export interface EvidenceCitationTriggerProps {
    citation: EvidenceCitationRef;
    className?: string;
}

/**
 * Resolves a committed or streaming citation to its exact evidence identity.
 * An unresolvable citation renders nothing: the existing label and external
 * link remain, and no URL fallback is attempted.
 */
export function EvidenceCitationTrigger({
    citation,
    className,
}: EvidenceCitationTriggerProps) {
    const { adapter } = useEvidencePreview();
    const [descriptor, setDescriptor] =
        React.useState<EvidenceDescriptor | null>(null);
    const [resolving, setResolving] = React.useState(true);
    const key = citationKey(citation);

    React.useEffect(() => {
        let current = true;
        setResolving(true);
        setDescriptor(null);
        adapter
            .resolveCitation(citation)
            .then((resolved) => {
                if (current) {
                    setDescriptor(resolved);
                    setResolving(false);
                }
            })
            .catch(() => {
                if (current) {
                    setDescriptor(null);
                    setResolving(false);
                }
            });
        return () => {
            current = false;
        };
        // The identity key is the stable input; citation object identity is not.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adapter, key]);

    if (resolving) {
        return (
            <span
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                aria-hidden="true"
            >
                <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
            </span>
        );
    }
    if (!descriptor) {
        return null;
    }
    return (
        <EvidenceTrigger
            descriptor={descriptor}
            citation={citation}
            label="Preview evidence"
            className={className}
        />
    );
}
