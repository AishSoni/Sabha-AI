"use client";

/**
 * Recorded shared-document panel (spec-17).
 *
 * Reads the checkpoint document bundle through the runtime and exposes only
 * passive asset metadata. Upload/delete/download actions are absent.
 */
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useMeetingsRuntime } from "./context";

export function RecordedDocumentsPanel({ meetingId }: { meetingId: string }) {
    const runtime = useMeetingsRuntime();
    const documents = useQuery({
        queryKey: runtime.keys.documents(meetingId),
        queryFn: ({ signal }) =>
            runtime.reads.documents
                ? runtime.reads.documents(meetingId, signal)
                : Promise.resolve([]),
    });

    const items = documents.data ?? [];
    if (documents.isPending) {
        return <p className="p-4 text-sm text-zinc-500">Loading recorded documents…</p>;
    }
    if (documents.isError) {
        return (
            <p className="p-4 text-sm text-zinc-400">
                The recorded document list is unavailable.
            </p>
        );
    }
    if (items.length === 0) {
        return (
            <p className="p-4 text-sm text-zinc-500">
                No recorded documents are visible at this checkpoint.
            </p>
        );
    }

    return (
        <div className="p-4 space-y-2">
            {items.map((document) => (
                <div
                    key={document.id}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
                >
                    <FileText className="w-4 h-4 text-zinc-500" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-zinc-200">
                            {document.file_name}
                        </p>
                        <p className="text-xs text-zinc-500">
                            {document.status} · recorded
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}
