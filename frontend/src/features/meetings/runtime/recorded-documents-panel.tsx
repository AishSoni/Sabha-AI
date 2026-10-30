"use client";

/**
 * Recorded Files panel (spec 21).
 *
 * The Documents tab in replay is a read-only Files inventory of every asset
 * published with the package, plus any recorded meeting documents visible at
 * the current checkpoint. Upload, delete, and retry actions are absent.
 */
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { EvidenceTrigger } from "../evidence/trigger";
import type { ReplayAsset } from "./contract";
import { useMeetingsRuntime } from "./context";
import { descriptorForAsset, isDemoAuthoredInput } from "./replay-evidence";

function formatSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AssetRow({ asset }: { asset: ReplayAsset }) {
    const descriptor = descriptorForAsset(asset);
    return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-3">
            <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm text-zinc-200">{descriptor.title}</p>
                    <p className="text-xs text-zinc-500">
                        {asset.media_type} · {formatSize(asset.size)}
                        {asset.capture_date ? ` · captured ${asset.capture_date}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">{asset.source}</p>
                    <p className="text-xs text-zinc-600">{asset.rights}</p>
                    {asset.extraction ? (
                        <p className="text-xs text-zinc-600">
                            Extraction: {asset.extraction}
                        </p>
                    ) : null}
                </div>
                {descriptor.readiness === "ready" ? (
                    <EvidenceTrigger descriptor={descriptor} />
                ) : (
                    <span className="shrink-0 text-xs text-zinc-500">
                        Preview unavailable
                    </span>
                )}
            </div>
        </div>
    );
}

export function RecordedDocumentsPanel({ meetingId }: { meetingId: string }) {
    const runtime = useMeetingsRuntime();
    const assets = runtime.replay?.assets ?? [];

    const documents = useQuery({
        queryKey: runtime.keys.documents(meetingId),
        queryFn: ({ signal }) =>
            runtime.reads.documents
                ? runtime.reads.documents(meetingId, signal)
                : Promise.resolve([]),
    });

    const recordedDocuments = documents.data ?? [];
    const groups = [
        {
            key: "retained",
            title: "Retained source material",
            description:
                "Third-party material transcribed or excerpted for this replay; not a historical original.",
            assets: assets.filter((asset) => !asset.authored),
        },
        {
            key: "prepared",
            title: "Prepared for this replay",
            description:
                "Authored for playback. These files are not historical originals.",
            assets: assets.filter(
                (asset) => asset.authored && !isDemoAuthoredInput(asset)
            ),
        },
        {
            key: "demo",
            title: "Demo-authored participant inputs",
            description:
                "Demo-authored private inputs included with this public replay. They are not protected customer data.",
            assets: assets.filter(isDemoAuthoredInput),
        },
    ].filter((group) => group.assets.length > 0);

    const empty =
        groups.length === 0 &&
        recordedDocuments.length === 0 &&
        !documents.isPending;

    return (
        <div className="space-y-6 p-4">
            <div className="space-y-1">
                <h2 className="text-sm font-medium text-zinc-200">Files</h2>
                <p className="text-xs text-zinc-500">
                    Read-only files retained for this replay. No upload or delete
                    actions are available.
                </p>
            </div>

            {empty ? (
                <p className="text-sm text-zinc-500">
                    No files are available for this replay.
                </p>
            ) : null}

            {groups.map((group) => (
                <section key={group.key} className="space-y-2">
                    <div className="space-y-1">
                        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                            {group.title}
                        </h3>
                        <p className="text-xs text-zinc-500">{group.description}</p>
                    </div>
                    <div className="space-y-2">
                        {group.assets.map((asset) => (
                            <AssetRow key={asset.asset_id} asset={asset} />
                        ))}
                    </div>
                </section>
            ))}

            {recordedDocuments.length > 0 ? (
                <section className="space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                        Recorded meeting documents
                    </h3>
                    <div className="space-y-2">
                        {recordedDocuments.map((document) => (
                            <div
                                key={document.id}
                                className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
                            >
                                <FileText className="h-4 w-4 text-zinc-500" />
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
                </section>
            ) : null}

            {documents.isError ? (
                <p className="text-xs text-zinc-500">
                    Recorded meeting documents are unavailable at this checkpoint.
                </p>
            ) : null}
        </div>
    );
}
