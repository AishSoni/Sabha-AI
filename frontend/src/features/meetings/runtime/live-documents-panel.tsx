"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { DocumentPanel } from "@/features/knowledge";
import { useMeetingsRuntime } from "./context";
import { EvidenceTrigger } from "../evidence/trigger";
import { liveDescriptorForDocument } from "./live-evidence";

/**
 * Live-only meeting document composition (spec-14).
 *
 * The preview action is injected into the knowledge panel as a render prop so
 * the shared evidence dialog stays in the meetings composition and the
 * knowledge feature never depends on a meetings runtime.
 */
export function LiveDocumentsPanel({ meetingId }: { meetingId: string }) {
    const runtime = useMeetingsRuntime();
    const evidence = runtime.evidence;
    return (
        <ScrollArea className="h-full p-4">
            <div className="max-w-3xl mx-auto">
                <DocumentPanel
                    scope={{ meetingId }}
                    renderPreviewAction={
                        evidence
                            ? (document) =>
                                  document.status === "ready" && document.revision_id ? (
                                      <EvidenceTrigger
                                          descriptor={liveDescriptorForDocument(document)}
                                      />
                                  ) : null
                            : undefined
                    }
                />
            </div>
        </ScrollArea>
    );
}
