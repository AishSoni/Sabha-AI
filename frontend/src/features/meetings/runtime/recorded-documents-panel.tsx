"use client";

/**
 * Recorded Files panel (spec 21).
 *
 * The Documents tab in replay is a read-only Files inventory of every asset
 * published with the package, plus any recorded meeting documents visible at
 * the current checkpoint. Upload, delete, and retry actions are absent.
 */
import type { ComponentType } from "react";
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
        <div className="rounded-control border border-separator bg-surface/50 px-3 py-3">
            <div className="flex items-start gap-3">
                <FileText className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate type-control text-ink">{descriptor.title}</p>
                    <p className="type-meta text-ink-muted">
                        {asset.media_type} · {formatSize(asset.size)}
                        {asset.capture_date ? ` · captured ${asset.capture_date}` : ""}
                    </p>
                    <p className="type-meta text-ink-muted">{asset.source}</p>
                    <p className="type-meta text-ink-muted">{asset.rights}</p>
                    {asset.extraction ? (
                        <p className="type-meta text-ink-muted">
                            Extraction: {asset.extraction}
                        </p>
                    ) : null}
                </div>
                {descriptor.readiness === "ready" ? (
                    <EvidenceTrigger descriptor={descriptor} />
                ) : (
                    <span className="shrink-0 type-meta text-ink-muted">
                        Preview unavailable
                    </span>
                )}
            </div>
        </div>
    );
}

export function RecordedDocumentsPanel({
    meetingId,
    addedDocuments: AddedDocuments,
}: {
    meetingId: string;
    addedDocuments?: ComponentType<{ meetingId: string }>;
}) {
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
                "Third-party material transcribed or excerpted for this demo; not a historical original.",
            assets: assets.filter((asset) => !asset.authored),
        },
        {
            key: "prepared",
            title: "Included in this demo",
            description:
                "Authored for the demo. These files are not historical originals.",
            assets: assets.filter(
                (asset) => asset.authored && !isDemoAuthoredInput(asset)
            ),
        },
        {
            key: "demo",
            title: "Participant inputs",
            description:
                "Private inputs included with this demo. They are not protected customer data.",
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
                <h2 className="type-section-title">Documents</h2>
                <p className="type-meta text-ink-muted">
                    Package documents are read-only. Added samples stay in this
                    browser and can be retried or removed.
                </p>
            </div>

            {empty ? (
                <p className="type-body text-ink-muted">
                    No documents are available for this demo.
                </p>
            ) : null}

            {groups.map((group) => (
                <section key={group.key} className="space-y-2">
                    <div className="space-y-1">
                        <h3 className="type-control font-medium uppercase tracking-wide text-ink-secondary">
                            {group.title}
                        </h3>
                        <p className="type-meta text-ink-muted">{group.description}</p>
                    </div>
                    <div className="space-y-2">
                        {group.assets.map((asset) => (
                            <AssetRow key={asset.asset_id} asset={asset} />
                        ))}
                    </div>
                </section>
            ))}

            {AddedDocuments ? <AddedDocuments meetingId={meetingId} /> : null}

            {recordedDocuments.length > 0 ? (
                <section className="space-y-2">
                    <h3 className="type-control font-medium uppercase tracking-wide text-ink-secondary">
                        Demo documents
                    </h3>
                    <div className="space-y-2">
                        {recordedDocuments.map((document) => (
                            <div
                                key={document.id}
                                className="flex items-center gap-3 rounded-control border border-separator bg-surface/50 px-3 py-2"
                            >
                                <FileText className="size-4 text-ink-muted" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate type-control text-ink">
                                        {document.file_name}
                                    </p>
                                    <p className="type-meta text-ink-muted">
                                        {document.status} · retained
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {documents.isError ? (
                <p className="text-xs text-ink-muted">
                    Meeting documents are unavailable at this checkpoint.
                </p>
            ) : null}
        </div>
    );
}
