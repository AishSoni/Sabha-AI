"use client";

/**
 * Optional recorded-log notices (spec-29).
 *
 * Disagreements and consensus stay authoritative in their room tabs. These
 * notices are a dismissible side channel: ignoring one never advances or
 * blocks the tutorial, and dismissing one never removes the record.
 */
import {
    useCallback,
    useEffect,
    useRef,
    useSyncExternalStore,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useDemoWorkspace } from "@/features/demo-workspace";
import {
    useReplayRun,
    useRuntimeConsensus,
    useRuntimeDisagreements,
} from "@/features/meetings/presentation";
import { useDemoTutorial } from "./provider";
import { useModalOpen } from "./presence";

export interface TutorialNotice {
    /** Stable log identity; the same record never notifies twice. */
    key: string;
    kind: "disagreement" | "consensus";
    title: string;
    detail: string;
    tab: "disagreements" | "consensus";
}

const MAX_VISIBLE = 3;

let visible: TutorialNotice[] = [];
let queued: TutorialNotice[] = [];
const seenKeys = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
    for (const listener of listeners) listener();
}

function promote(): void {
    while (visible.length < MAX_VISIBLE && queued.length > 0) {
        const next = queued.shift();
        if (next) visible = [...visible, next];
    }
}

export function enqueueNotice(notice: TutorialNotice): void {
    if (seenKeys.has(notice.key)) return;
    seenKeys.add(notice.key);
    if (visible.length < MAX_VISIBLE) {
        visible = [...visible, notice];
    } else {
        queued = [...queued, notice];
    }
    emit();
}

export function dismissNotice(key: string): void {
    visible = visible.filter((notice) => notice.key !== key);
    promote();
    emit();
}

export function clearNotices(): void {
    visible = [];
    queued = [];
    seenKeys.clear();
    emit();
}

export function clearNoticeQueueOnly(): void {
    visible = [];
    queued = [];
    emit();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function useVisibleNotices(): TutorialNotice[] {
    return useSyncExternalStore(
        subscribe,
        () => visible,
        () => []
    );
}

/**
 * Watches the recorded log reads. Only records that appear after the visitor
 * started playing turns are announced; a chapter snapshot is inspection.
 */
export function TutorialNotices() {
    const tutorial = useDemoTutorial();
    const run = useReplayRun();
    const workspace = useDemoWorkspace();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const modalOpen = useModalOpen();
    const disagreements = useRuntimeDisagreements(run.session.meeting_id);
    const consensus = useRuntimeConsensus(run.session.meeting_id);
    const notices = useVisibleNotices();

    const baseline = useRef<Set<string> | null>(null);
    const pendingFocus = useRef<string | null>(null);
    const resetEpoch = workspace.workspaceResetEpoch;

    useEffect(() => {
        clearNotices();
        baseline.current = null;
    }, [resetEpoch]);

    const progressed =
        tutorial.journey.replyCount > 0 ||
        tutorial.journey.settledIntents.size > 0 ||
        tutorial.journey.closingCompleted;

    useEffect(() => {
        if (!disagreements.data || !consensus.data) return;
        const rows: TutorialNotice[] = [
            ...disagreements.data.map((item) => ({
                key: `disagreement:${item.id}`,
                kind: "disagreement" as const,
                title: "Disagreement logged",
                detail: item.topic,
                tab: "disagreements" as const,
            })),
            ...consensus.data.map((item) => ({
                key: `consensus:${item.id}`,
                kind: "consensus" as const,
                title: "Consensus logged",
                detail: item.topic,
                tab: "consensus" as const,
            })),
        ];
        if (tutorial.chapterId !== null) {
            // Inspection only: these records can never become new notices.
            baseline.current = new Set(
                rows.map((row) => row.key).filter((key) => !seenKeys.has(key))
            );
            return;
        }
        if (!progressed) {
            baseline.current = new Set(rows.map((row) => row.key));
            return;
        }
        for (const row of rows) {
            if (baseline.current?.has(row.key)) continue;
            enqueueNotice(row);
        }
    }, [
        disagreements.data,
        consensus.data,
        progressed,
        tutorial.chapterId,
    ]);

    const tab = searchParams.get("tab");
    useEffect(() => {
        const target = pendingFocus.current;
        if (!target || tab !== target) return;
        pendingFocus.current = null;
        // Radix mounts the selected panel after this commit; wait for it before
        // moving focus to its heading.
        let frame = 0;
        let cancelled = false;
        const focus = () => {
            if (cancelled) return;
            const heading = document.getElementById(`${target}-heading`);
            if (heading) {
                heading.focus();
                return;
            }
            frame += 1;
            if (frame <= 5) requestAnimationFrame(focus);
        };
        frame = requestAnimationFrame(focus);
        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
        };
    }, [tab]);

    const view = useCallback(
        (notice: TutorialNotice) => {
            dismissNotice(notice.key);
            const next = new URLSearchParams(searchParams.toString());
            next.set("tab", notice.tab);
            next.delete("chapter");
            const href = `${pathname}?${next.toString()}`;
            pendingFocus.current = notice.tab;
            router.replace(href);
            // The heading may already be mounted when the tab did not change.
            if (tab === notice.tab) {
                pendingFocus.current = null;
                document
                    .getElementById(`${notice.tab}-heading`)
                    ?.focus();
            }
        },
        [pathname, router, searchParams, tab]
    );

    if (notices.length === 0) return null;

    return (
        <div
            data-testid="tutorial-notices"
            role="status"
            aria-label="Recorded updates"
            className="pointer-events-none fixed z-notice flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2"
            style={{
                bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
                left: "calc(env(safe-area-inset-left, 0px) + 1rem)",
            }}
            hidden={modalOpen}
        >
            {notices.map((notice) => (
                <div
                    key={notice.key}
                    className="m-notice pointer-events-none rounded-control border border-control bg-surface p-2.5 shadow-[var(--shadow-overlay)]"
                >
                    <div className="flex items-start gap-2">
                        {notice.kind === "disagreement" ? (
                            <AlertTriangle
                                className="mt-0.5 size-4 shrink-0 text-danger"
                                aria-hidden="true"
                            />
                        ) : (
                            <CheckCircle2
                                className="mt-0.5 size-4 shrink-0 text-success"
                                aria-hidden="true"
                            />
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="type-control font-medium text-ink">
                                {notice.title}
                            </p>
                            <p className="mt-0.5 line-clamp-2 type-meta text-ink-secondary">
                                {notice.detail}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => dismissNotice(notice.key)}
                            aria-label={`Dismiss ${notice.title}`}
                            className="pointer-events-auto shrink-0 rounded-control p-1 text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                            <X className="size-3.5" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="mt-1.5 flex justify-end">
                        <button
                            type="button"
                            onClick={() => view(notice)}
                            className="m-control pointer-events-auto rounded-control px-2 py-1 type-meta font-medium text-action hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                            View
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
