"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { DocumentPanel } from "@/features/knowledge";

/** Live-only meeting document composition (spec-14). */
export function LiveDocumentsPanel({ meetingId }: { meetingId: string }) {
    return (
        <ScrollArea className="h-full p-4">
            <div className="max-w-3xl mx-auto">
                <DocumentPanel scope={{ meetingId }} />
            </div>
        </ScrollArea>
    );
}
