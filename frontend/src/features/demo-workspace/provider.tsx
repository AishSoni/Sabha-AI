"use client";

/**
 * One volatile demo workspace (spec-23).
 *
 * This provider sits above the replay run controller and below the pinned
 * replay session. It owns the browser-memory practice catalog, the guide
 * bookmark, and the reset scopes. Replay playback state stays in
 * `ReplayRunProvider`; this provider only asks it to reset through a nonce.
 */
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { isApiError } from "@/shared/api/errors";
import { requestJson } from "@/shared/api/transport";
import {
    WORKSPACE_LIMITS,
    emptyLocalState,
    localStateFromSeed,
    workspaceQueryKey,
    type LocalOutcome,
    type PinnedPackageIdentity,
    type PlaybackReset,
    type WorkspaceLocalState,
    type WorkspacePublishedAsset,
    type WorkspaceSeed,
    type WorkspaceStatus,
} from "./contract";
import { decodeWorkspaceSeedEnvelope } from "./seed";

interface DemoWorkspaceContextValue {
    workspaceId: string;
    workspaceEpoch: number;
    /** Increments only on a full workspace reset, never on recording restart. */
    workspaceResetEpoch: number;
    status: WorkspaceStatus;
    error: string | null;
    seed: WorkspaceSeed | null;
    publishedAssets: WorkspacePublishedAsset[];
    local: WorkspaceLocalState;
    limits: typeof WORKSPACE_LIMITS;
    expanded: boolean;
    hasPracticeEdits: boolean;
    guideCollapsed: boolean;
    setGuideCollapsed: (value: boolean) => void;
    guideBookmark: string | null;
    setGuideBookmark: (beatId: string | null) => void;
    playbackReset: PlaybackReset;
    resetWorkspace: () => void;
    restartRecording: () => void;
    commitLocal: (
        update: (current: WorkspaceLocalState) => WorkspaceLocalState
    ) => LocalOutcome<void>;
    /** Latest committed state, for adapters that must not capture a render. */
    getLocal: () => WorkspaceLocalState;
    isCurrentEpoch: (epoch: number) => boolean;
    queryKey: (domain: string) => readonly [string, string, string];
}

const DemoWorkspaceContext = createContext<DemoWorkspaceContextValue | null>(
    null
);

export function useDemoWorkspace(): DemoWorkspaceContextValue {
    const value = useContext(DemoWorkspaceContext);
    if (!value) {
        throw new Error(
            "useDemoWorkspace must be used inside DemoWorkspaceProvider."
        );
    }
    return value;
}

function newWorkspaceId(): string {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
        return cryptoApi.randomUUID();
    }
    return `workspace-${Math.random().toString(36).slice(2)}`;
}

const WORKSPACE_RESET: LocalOutcome<never> = {
    ok: false,
    scope: "local",
    code: "workspace_reset",
    message: "This workspace was reset; the practice change was discarded.",
};

export function DemoWorkspaceProvider({
    identity,
    publishedAssets = [],
    children,
}: {
    identity: PinnedPackageIdentity;
    publishedAssets?: WorkspacePublishedAsset[];
    children: ReactNode;
}) {
    const [workspaceId] = useState(newWorkspaceId);
    const [workspaceEpoch, setWorkspaceEpoch] = useState(1);
    const [workspaceResetEpoch, setWorkspaceResetEpoch] = useState(1);
    const epochRef = useRef(1);
    const [status, setStatus] = useState<WorkspaceStatus>("loading");
    const [error, setError] = useState<string | null>(null);
    const [seed, setSeed] = useState<WorkspaceSeed | null>(null);
    const seedRef = useRef<WorkspaceSeed | null>(null);
    const [local, setLocal] = useState<WorkspaceLocalState>(emptyLocalState);
    const localRef = useRef<WorkspaceLocalState>(local);
    const [hasPracticeEdits, setHasPracticeEdits] = useState(false);
    const [guideCollapsed, setGuideCollapsed] = useState(false);
    const [guideBookmark, setGuideBookmark] = useState<string | null>(null);
    const [playbackReset, setPlaybackReset] = useState<PlaybackReset>({
        nonce: 0,
        reason: "workspace",
    });

    const applySeed = useCallback((nextSeed: WorkspaceSeed | null) => {
        seedRef.current = nextSeed;
        setSeed(nextSeed);
        const nextLocal = localStateFromSeed(nextSeed);
        localRef.current = nextLocal;
        setLocal(nextLocal);
        setHasPracticeEdits(false);
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        const params = new URLSearchParams();
        if (identity.packageId) params.set("package", identity.packageId);
        if (identity.version) params.set("version", identity.version);
        const query = params.toString();

        requestJson<unknown>(
            `/replay/workspace-seed${query ? `?${query}` : ""}`,
            { signal: controller.signal }
        )
            .then((payload) => {
                if (!active) return;
                const envelope = decodeWorkspaceSeedEnvelope(payload);
                if (
                    envelope.packageId !== identity.packageId ||
                    envelope.version !== identity.version ||
                    envelope.contentSha256 !== identity.contentSha256 ||
                    envelope.seedVersion !== envelope.seed.seedVersion
                ) {
                    applySeed(null);
                    setStatus("mismatch");
                    setError(
                        "The workspace expansion does not match the pinned recording. Practice features are disabled so recorded content and practice edits cannot be mixed."
                    );
                    return;
                }
                applySeed(envelope.seed);
                setStatus("ready");
            })
            .catch((cause) => {
                if (!active || controller.signal.aborted) return;
                applySeed(null);
                if (isApiError(cause) && cause.status === 404) {
                    setStatus("legacy");
                    setError(
                        "This recording was published before the practice workspace existed. The original guided journey is unchanged; practice features are unavailable."
                    );
                    return;
                }
                setStatus("unavailable");
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "The practice workspace seed is unavailable."
                );
            });

        return () => {
            active = false;
            controller.abort();
        };
    }, [
        applySeed,
        identity.packageId,
        identity.version,
        identity.contentSha256,
    ]);

    const commitLocal = useCallback(
        (
            update: (current: WorkspaceLocalState) => WorkspaceLocalState
        ): LocalOutcome<void> => {
            const captured = epochRef.current;
            const current = localRef.current;
            const next = update(current);
            if (epochRef.current !== captured) {
                return WORKSPACE_RESET;
            }
            if (next === current) {
                return { ok: true, scope: "local", value: undefined };
            }
            localRef.current = next;
            setLocal(next);
            setHasPracticeEdits(true);
            return { ok: true, scope: "local", value: undefined };
        },
        []
    );

    const getLocal = useCallback(() => localRef.current, []);

    const isCurrentEpoch = useCallback(
        (epoch: number) => epochRef.current === epoch,
        []
    );

    const bumpEpoch = useCallback(() => {
        epochRef.current += 1;
        setWorkspaceEpoch(epochRef.current);
    }, []);

    const resetWorkspace = useCallback(() => {
        bumpEpoch();
        setWorkspaceResetEpoch((value) => value + 1);
        applySeed(seedRef.current);
        setGuideCollapsed(false);
        setGuideBookmark(null);
        setPlaybackReset((previous) => ({
            nonce: previous.nonce + 1,
            reason: "workspace",
        }));
    }, [applySeed, bumpEpoch]);

    const restartRecording = useCallback(() => {
        bumpEpoch();
        setGuideBookmark(null);
        setPlaybackReset((previous) => ({
            nonce: previous.nonce + 1,
            reason: "recording",
        }));
    }, [bumpEpoch]);

    const queryKey = useCallback(
        (domain: string) => workspaceQueryKey(workspaceId, domain),
        [workspaceId]
    );

    const value = useMemo<DemoWorkspaceContextValue>(
        () => ({
            workspaceId,
            workspaceEpoch,
            workspaceResetEpoch,
            status,
            error,
            seed,
            publishedAssets,
            local,
            limits: WORKSPACE_LIMITS,
            expanded: status === "ready",
            hasPracticeEdits,
            guideCollapsed,
            setGuideCollapsed,
            guideBookmark,
            setGuideBookmark,
            playbackReset,
            resetWorkspace,
            restartRecording,
            commitLocal,
            getLocal,
            isCurrentEpoch,
            queryKey,
        }),
        [
            workspaceId,
            workspaceEpoch,
            workspaceResetEpoch,
            status,
            error,
            seed,
            publishedAssets,
            local,
            hasPracticeEdits,
            guideCollapsed,
            guideBookmark,
            playbackReset,
            resetWorkspace,
            restartRecording,
            commitLocal,
            getLocal,
            isCurrentEpoch,
            queryKey,
        ]
    );

    return (
        <DemoWorkspaceContext.Provider value={value}>
            {children}
        </DemoWorkspaceContext.Provider>
    );
}
