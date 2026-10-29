"use client";

import { EvidencePreviewDialog } from "./dialog";
import { useEvidencePreview } from "./provider";

/**
 * The single dialog host. Mount once per room, never per row or message.
 */
export function EvidencePreviewHost() {
    const { active, state, close, retry } = useEvidencePreview();

    return (
        <EvidencePreviewDialog
            open={active !== null}
            descriptor={active?.descriptor ?? null}
            citation={active?.citation ?? {}}
            state={state}
            onClose={close}
            onRetry={retry}
        />
    );
}
