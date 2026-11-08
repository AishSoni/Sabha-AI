"use client";

/**
 * Browser-memory document adapter for practice knowledge screens (spec-25).
 *
 * It reuses the shared document vocabulary and the package's data-only
 * scenarios. It never calls the live upload API, stores source bytes, or starts
 * server-side work.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDemoWorkspace } from "@/features/demo-workspace";
import type {
    WorkspaceDocument,
    WorkspaceSample,
} from "@/features/demo-workspace";
import type { KnowledgeDocumentView } from "../presentation/contract";
import {
    addLocalDocument,
    advanceLocalDocument,
    participantCanRetrieve,
    removeLocalDocument,
    retryLocalDocument,
    sampleAlreadyAdded,
    scopeCounts,
    scopeDocuments,
    type AddDocumentFailure,
    type LocalDocumentScope,
} from "./document-state";
import { SampleSourceError, verifySampleSource } from "./sample-source";

const QUEUE_DELAY_MS = 250;
const INDEXING_DELAY_MS = 750;

function localId(prefix: string): string {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
        return `${prefix}-${cryptoApi.randomUUID()}`;
    }
    return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function addFailureMessage(reason: AddDocumentFailure): string {
    switch (reason) {
        case "sample_unavailable":
            return "The sample is not available in this workspace.";
        case "destination_not_allowed":
            return "This sample cannot be added to this destination.";
        case "duplicate_sample":
            return "This sample is already added in this destination.";
        case "limit_reached":
            return "This workspace reached its document record limit. Remove a document or reset the demo.";
        case "concurrent_limit":
            return "Two documents are already processing. Wait for one to finish.";
    }
}

function toDocumentView(
    document: WorkspaceDocument,
    sample: WorkspaceSample | undefined
): KnowledgeDocumentView | null {
    if (!sample) return null;
    return {
        id: document.documentId,
        file_name: sample.fileName,
        file_type:
            sample.fileName.split(".").pop()?.toLowerCase() ??
            sample.mediaType,
        file_size_bytes: sample.sizeBytes,
        status: document.status,
        chunk_count: document.status === "ready" ? document.chunkCount : 0,
        operation_id: document.operationId,
        error_message: document.errorMessage ?? null,
    };
}

export interface LocalDocumentsAdapter {
    documents: KnowledgeDocumentView[];
    counts: { total: number; ready: number };
    samples: WorkspaceSample[];
    isLoading: boolean;
    isError: boolean;
    uploading: boolean;
    localError: string | null;
    removingId: string | null;
    addSample: (
        sample: WorkspaceSample
    ) => Promise<{ ok: true } | { ok: false; error: string }>;
    retryDocument: (operationId: string) => void;
    removeDocument: (document: KnowledgeDocumentView) => void;
    isAlreadyAdded: (sample: WorkspaceSample) => boolean;
    sampleForDocument: (
        document: KnowledgeDocumentView
    ) => WorkspaceSample | undefined;
    participantCanRetrieve: (
        document: WorkspaceDocument,
        participant: {
            participantId: string;
            meetingId: string;
            stackIds: readonly string[];
        }
    ) => boolean;
}

export interface UseLocalDocumentsOptions {
    audienceLabel?: string;
    /** Test/composition seam for the bounded source verifier. */
    verifySample?: typeof verifySampleSource;
    now?: () => Date;
    idFactory?: (prefix: string) => string;
    /** Bounded presentation delays; production uses the authored defaults. */
    queueDelayMs?: number;
    indexingDelayMs?: number;
}

export function useLocalDocuments(
    scope: LocalDocumentScope,
    options: UseLocalDocumentsOptions = {}
): LocalDocumentsAdapter {
    const workspace = useDemoWorkspace();
    const verifySample = options.verifySample ?? verifySampleSource;
    const now = useMemo(() => options.now ?? (() => new Date()), [options.now]);
    const idFactory = options.idFactory ?? localId;
    const queueDelayMs = options.queueDelayMs ?? QUEUE_DELAY_MS;
    const indexingDelayMs = options.indexingDelayMs ?? INDEXING_DELAY_MS;
    const [uploading, setUploading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const timersRef = useRef(
        new Map<string, ReturnType<typeof setTimeout>>()
    );
    const epochRef = useRef(workspace.workspaceEpoch);

    const samples = useMemo(
        () => workspace.seed?.samples ?? [],
        [workspace.seed]
    );
    const samplesById = useMemo(
        () => new Map(samples.map((sample) => [sample.sampleId, sample])),
        [samples]
    );
    const documents = useMemo(
        () =>
            scopeDocuments(workspace.local.documents, scope)
                .map((document) =>
                    toDocumentView(
                        document,
                        samplesById.get(document.sampleId)
                    )
                )
                .filter(
                    (document): document is KnowledgeDocumentView =>
                        document !== null
                ),
        [scope, workspace.local.documents, samplesById]
    );
    const counts = useMemo(
        () => scopeCounts(workspace.local.documents, scope),
        [scope, workspace.local.documents]
    );

    const clearTimers = useCallback(() => {
        for (const timer of timersRef.current.values()) {
            clearTimeout(timer);
        }
        timersRef.current.clear();
    }, []);

    useEffect(() => {
        if (epochRef.current !== workspace.workspaceEpoch) {
            epochRef.current = workspace.workspaceEpoch;
            clearTimers();
        }
        const wanted = new Set<string>();
        for (const document of workspace.local.documents) {
            if (document.status !== "pending" && document.status !== "processing") {
                continue;
            }
            const key = `${document.documentId}:${document.status}`;
            wanted.add(key);
            if (timersRef.current.has(key)) continue;
            const epoch = workspace.workspaceEpoch;
            const delay =
                document.status === "pending"
                    ? queueDelayMs
                    : indexingDelayMs;
            const timer = setTimeout(() => {
                timersRef.current.delete(key);
                if (!workspace.isCurrentEpoch(epoch)) return;
                workspace.commitLocal((current) =>
                    advanceLocalDocument(
                        current,
                        document.documentId,
                        samplesById.get(document.sampleId)
                    )
                );
            }, delay);
            timersRef.current.set(key, timer);
        }
        for (const [key, timer] of timersRef.current) {
            if (wanted.has(key)) continue;
            clearTimeout(timer);
            timersRef.current.delete(key);
        }
    }, [
        clearTimers,
        indexingDelayMs,
        queueDelayMs,
        samplesById,
        workspace,
        workspace.workspaceEpoch,
        workspace.local.documents,
    ]);

    useEffect(() => clearTimers, [clearTimers]);

    const addSample = useCallback(
        async (
            sample: WorkspaceSample
        ): Promise<{ ok: true } | { ok: false; error: string }> => {
            setLocalError(null);
            if (!workspace.expanded) {
                const error =
                    "Documents are unavailable because this workspace cannot expand.";
                setLocalError(error);
                return { ok: false, error };
            }
            const currentSample = workspace.seed?.samples.find(
                (candidate) => candidate.sampleId === sample.sampleId
            );
            if (!currentSample) {
                const error =
                    "The sample is not available in this workspace.";
                setLocalError(error);
                return { ok: false, error };
            }
            if (!currentSample.destinationKinds.includes(scope.kind)) {
                const error =
                    "This sample cannot be added to this destination.";
                setLocalError(error);
                return { ok: false, error };
            }
            if (sampleAlreadyAdded(workspace.getLocal().documents, currentSample.sampleId, scope)) {
                const error =
                    "This sample is already added in this destination.";
                setLocalError(error);
                return { ok: false, error };
            }
            const asset = workspace.publishedAssets.find(
                (candidate) => candidate.assetId === currentSample.assetId
            );
            setUploading(true);
            const epoch = workspace.workspaceEpoch;
            try {
                await verifySample(currentSample, asset);
            } catch (cause) {
                const error =
                    cause instanceof SampleSourceError
                        ? cause.message
                        : "The sample could not be verified.";
                setUploading(false);
                if (workspace.isCurrentEpoch(epoch)) {
                    setLocalError(error);
                }
                return { ok: false, error };
            }
            setUploading(false);
            if (!workspace.isCurrentEpoch(epoch)) {
                return {
                    ok: false,
                    error:
                        "This workspace was reset; the sample was not added.",
                };
            }
            const ids = {
                documentId: idFactory("practice-document"),
                operationId: idFactory("practice-operation"),
                revisionId: idFactory("practice-revision"),
                createdAt: now().toISOString(),
            };
            let addFailure: AddDocumentFailure | null = null;
            const outcome = workspace.commitLocal((current) => {
                const result = addLocalDocument(current, currentSample, scope, ids);
                if (!result.ok) {
                    addFailure = result.reason;
                    return current;
                }
                return result.state;
            });
            setUploading(false);
            if (!outcome.ok) {
                const error = outcome.message;
                setLocalError(error);
                return { ok: false, error };
            }
            if (addFailure) {
                const error = addFailureMessage(addFailure);
                setLocalError(error);
                return { ok: false, error };
            }
            return { ok: true };
        },
        [scope, workspace, verifySample, now, idFactory]
    );

    const retryDocument = useCallback(
        (operationId: string) => {
            const current = workspace
                .getLocal()
                .documents.find(
                    (document) => document.operationId === operationId
                );
            if (!current || current.status !== "failed") return;
            setLocalError(null);
            workspace.commitLocal((state) =>
                retryLocalDocument(state, current.documentId)
            );
        },
        [workspace]
    );

    const removeDocument = useCallback(
        (document: KnowledgeDocumentView) => {
            setLocalError(null);
            setRemovingId(document.id);
            workspace.commitLocal((state) =>
                removeLocalDocument(state, document.id)
            );
            setRemovingId(null);
        },
        [workspace]
    );

    const alreadyAdded = useCallback(
        (sample: WorkspaceSample) =>
            sampleAlreadyAdded(
                workspace.getLocal().documents,
                sample.sampleId,
                scope
            ),
        [scope, workspace]
    );

    const sampleForDocument = useCallback(
        (document: KnowledgeDocumentView) => {
            const record = workspace.local.documents.find(
                (candidate) => candidate.documentId === document.id
            );
            return record ? samplesById.get(record.sampleId) : undefined;
        },
        [samplesById, workspace.local.documents]
    );

    return {
        documents,
        counts,
        samples,
        isLoading: workspace.status === "loading",
        isError: workspace.status === "unavailable",
        uploading,
        localError:
            localError ??
            (workspace.status === "mismatch" ? workspace.error : null),
        removingId,
        addSample,
        retryDocument,
        removeDocument,
        isAlreadyAdded: alreadyAdded,
        sampleForDocument,
        participantCanRetrieve,
    };
}
