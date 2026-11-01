"use client";

/**
 * Guided replay controller and panel (spec-18).
 *
 * The guide owns only the step order, stable anchors, route/tab hints, and
 * Continue/Back/Restart. It never clicks DOM controls or invents meeting state.
 * A step completes only when the recorded package condition is present.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    ArrowLeft,
    ArrowRight,
    FileText,
    Play,
    RotateCcw,
    Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
    ReplayAsset,
    ReplayBeat,
    ReplayBeatStep,
} from "../runtime/contract";
import { chapterHref } from "../runtime/chapters";
import { descriptorForAsset } from "../runtime/replay-evidence";
import { useReplayRun } from "../runtime/replay-run";
import { useDemoWorkspace } from "@/features/demo-workspace";
import { ActiveReplayIntentProvider } from "../runtime/active-intent";
import { GuideActionsProvider } from "./guide-actions";
import {
    destinationIncludesLocation,
    resolveGuidedBeatDestination,
    type GuidedBeatDestination,
} from "./replay-destination";

function stepSatisfied(
    step: ReplayBeatStep,
    beat: ReplayBeat,
    run: ReturnType<typeof useReplayRun>,
    acknowledgedBeats: ReadonlySet<string> = run.acknowledgedBeats
): boolean {
    if (step.completion === "acknowledge") {
        return acknowledgedBeats.has(beat.beat_id);
    }
    if (!step.intent_id || !run.settledIntents.has(step.intent_id)) return false;
    if (step.completion === "closing_completed" && !run.closingSettled) {
        return false;
    }
    return true;
}

function isJourneyRoute(pathname: string): boolean {
    return (
        pathname === "/demo" ||
        pathname === "/demo/new" ||
        pathname === "/demo/meetings" ||
        /^\/demo\/meetings\/[^/]+$/.test(pathname)
    );
}

export function GuidedReplay({ children }: { children: ReactNode }) {
    const run = useReplayRun();
    const workspace = useDemoWorkspace();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const tab = searchParams.get("tab");
    const [navigating, setNavigating] = useState(false);
    const [explorationIndex, setExplorationIndex] = useState<number | null>(
        null
    );
    const [error, setError] = useState<string | null>(null);

    const beats = useMemo(() => {
        return [...run.session.beats].sort((left, right) => {
            const a = left.ordinal ?? Number.MAX_SAFE_INTEGER;
            const b = right.ordinal ?? Number.MAX_SAFE_INTEGER;
            return a - b;
        });
    }, [run.session.beats]);

    /**
     * A review is the last action in its beat. Once a later canonical beat has
     * actually run, the review window has passed and the guide must not remain
     * stranded behind the recorded meeting. Chapter detours do not settle
     * canonical intents, so inspecting a snapshot still cannot advance the
     * guide.
     */
    const acknowledgedBeats = useMemo(() => {
        const result = new Set(run.acknowledgedBeats);
        beats.forEach((beat, beatIndex) => {
            if (
                !beat.steps.some(
                    (step) => step.completion === "acknowledge"
                )
            ) {
                return;
            }
            const laterCanonicalSettled = beats
                .slice(beatIndex + 1)
                .some((laterBeat) =>
                    laterBeat.steps.some(
                        (step) =>
                            step.intent_id &&
                            run.settledIntents.has(step.intent_id)
                    )
                );
            if (laterCanonicalSettled) result.add(beat.beat_id);
        });
        return result;
    }, [beats, run.acknowledgedBeats, run.settledIntents]);

    const beatSatisfied = (beat: ReplayBeat) =>
        beat.steps.every((step) =>
            stepSatisfied(step, beat, run, acknowledgedBeats)
        );

    /**
     * Progress is recorded evidence, never the ordinal of the snapshot the
     * visitor happens to be inspecting. A branch action or a chapter detour
     * cannot complete a canonical beat, and jumping to a later snapshot cannot
     * make an unfinished beat look done.
     */
    const settledIndex = (() => {
        for (let i = 0; i < beats.length; i += 1) {
            if (!beatSatisfied(beats[i])) return i;
        }
        return beats.length;
    })();

    // Terminal recorded states dominate the linear cursor. If the meeting has
    // already ended, the guide must show the archive step rather than an
    // earlier review that is now moot. An archived meeting is complete.
    const closingBeatIndex = beats.findIndex((beat) =>
        beat.steps.some((step) => step.completion === "closing_completed")
    );
    const archiveIntentId = beats[beats.length - 1]?.steps.find(
        (step) => step.intent_id
    )?.intent_id;
    const archived = Boolean(
        archiveIntentId && run.settledIntents.has(archiveIntentId)
    );
    const index = archived
        ? beats.length
        : run.closingSettled && closingBeatIndex >= 0
          ? Math.max(settledIndex, closingBeatIndex + 1)
          : settledIndex;

    const finished = index >= beats.length;
    const current = beats[index] ?? null;
    const stepAssets = Array.from(
        new Set(current?.input_asset_ids ?? [])
    )
        .map((assetId) =>
            run.session.assets.find((asset) => asset.asset_id === assetId)
        )
        .filter((asset): asset is ReplayAsset => Boolean(asset));
    const canOpenStepDocuments =
        current?.route === "meeting" &&
        run.checkpoint !== run.session.initial_checkpoint;
    const stepDocumentsHref = canOpenStepDocuments
        ? `/demo/meetings/${encodeURIComponent(
              run.session.meeting_id
          )}?tab=documents`
        : null;
    const journeyRoute = isJourneyRoute(pathname);
    const chapterParam = searchParams.get("chapter");
    const highlightedPersonaId =
        workspace.seed?.highlightedPersonaId ??
        workspace.seed?.personas[0]?.personaId ??
        null;
    const { setGuideBookmark } = workspace;

    useEffect(() => {
        const bookmark = current ?? (finished ? beats[beats.length - 1] : null);
        if (bookmark) setGuideBookmark(bookmark.beat_id);
    }, [beats, current, finished, setGuideBookmark]);

    const satisfied = current ? beatSatisfied(current) : false;
    const destinationFor = (
        beat: ReplayBeat,
        options?: { preferStart?: boolean }
    ): GuidedBeatDestination => {
        const pendingStep = beat.steps.find(
            (step) => !stepSatisfied(step, beat, run, acknowledgedBeats)
        );
        const interruptedIntentId =
            beat.steps
                .map((step) => step.intent_id)
                .find(
                    (intentId): intentId is string =>
                        typeof intentId === "string" &&
                        run.startedIntents.has(intentId) &&
                        !run.settledIntents.has(intentId)
                ) ?? null;
        return resolveGuidedBeatDestination(
            beat,
            run.session.meeting_id,
            run.session.transitions,
            {
                pendingStep,
                interruptedIntentId,
                preferStart: options?.preferStart,
            }
        );
    };
    const firstUnsatisfiedStep = current?.steps.find(
        (step) => !stepSatisfied(step, current, run, acknowledgedBeats)
    );
    const activeIntentId = firstUnsatisfiedStep?.intent_id ?? null;
    const reviewStep =
        firstUnsatisfiedStep?.completion === "acknowledge"
            ? firstUnsatisfiedStep
            : undefined;
    const pendingAcknowledge = Boolean(reviewStep);
    const reviewTabLabel = reviewStep?.requires_tab
        ? reviewStep.requires_tab.charAt(0).toUpperCase() +
          reviewStep.requires_tab.slice(1)
        : null;
    const currentDestination = current ? destinationFor(current) : null;
    const targetHref = currentDestination?.href ?? "/demo";
    const onTarget = currentDestination
        ? destinationIncludesLocation(
              currentDestination,
              pathname,
              tab
          )
        : false;
    /**
     * The URL can name the right screen while the installed snapshot is a
     * chapter or an older beat. Acknowledgement and Continue require both.
     */
    const atDestination = Boolean(
        onTarget &&
            currentDestination &&
            (currentDestination.checkpoint === null ||
                run.checkpoint === currentDestination.checkpoint)
    );
    const nextDestination =
        current && index < beats.length - 1
            ? destinationFor(beats[index + 1])
            : null;
    const nextHref = nextDestination?.href ?? null;
    const nextTab = nextDestination?.tab ?? null;
    const interruptedIntentIds = current
        ? current.steps
              .map((step) => step.intent_id)
              .filter(
                  (intentId): intentId is string =>
                      typeof intentId === "string" &&
                      run.startedIntents.has(intentId) &&
                      !run.settledIntents.has(intentId)
              )
        : [];
    const canResume = Boolean(
        workspace.guideBookmark || chapterParam || interruptedIntentIds.length > 0
    );
    const canContinue =
        !finished &&
        current !== null &&
        (!atDestination ||
            pendingAcknowledge ||
            (satisfied &&
                index < beats.length - 1 &&
                nextHref !== null &&
                nextHref !== targetHref));
    const backBase = explorationIndex ?? (finished ? beats.length : index);
    const canGoBack = !navigating && backBase > 0;

    const restart = () => {
        setExplorationIndex(null);
        workspace.restartRecording();
        router.push("/demo");
    };

    const navigateTo = async (
        destination: GuidedBeatDestination,
        operation?: () => Promise<void>
    ) => {
        setNavigating(true);
        setError(null);
        try {
            if (operation) {
                await operation();
            } else if (
                destination.checkpoint &&
                destination.checkpoint !== run.checkpoint
            ) {
                const outcome = await run.switchCheckpoint(
                    destination.checkpoint,
                    { force: true }
                );
                if (outcome === "aborted" || outcome === "superseded") return;
            }
            setExplorationIndex(null);
            router.push(destination.href);
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "The guided destination could not be restored."
            );
        } finally {
            setNavigating(false);
        }
    };

    const completeReview = (): boolean => {
        if (!current || !reviewStep) return false;
        if (
            currentDestination?.checkpoint &&
            run.checkpoint !== currentDestination.checkpoint
        ) {
            setError(
                "Restore the recorded result for this step before acknowledging it."
            );
            return false;
        }
        if (
            current.route === "meeting" &&
            reviewStep.requires_tab &&
            tab !== reviewStep.requires_tab
        ) {
            setError(
                `Open the ${
                    reviewStep.requires_tab
                } tab before acknowledging this step.`
            );
            return false;
        }
        run.acknowledgeBeat(current.beat_id);
        const completesBeat = current.steps.every(
            (step) =>
                step.completion === "acknowledge" ||
                stepSatisfied(step, current, run, acknowledgedBeats)
        );
        if (completesBeat && nextDestination) {
            void navigateTo(nextDestination);
        }
        return true;
    };

    const resume = async () => {
        const target = finished ? beats[beats.length - 1] : current;
        if (!target) return;
        const interruptedIntentId = interruptedIntentIds[0];
        const destination = destinationFor(target);
        await navigateTo(
            destination,
            interruptedIntentId
                ? () => run.replayIntent(interruptedIntentId)
                : undefined
        );
    };

    const back = async () => {
        if (!canGoBack) return;
        const targetIndex = backBase - 1;
        const target = beats[targetIndex];
        if (!target) return;
        // Back only moves the exploration cursor. Completed canonical actions
        // stay complete, so the guide never rewinds evidence.
        setExplorationIndex(targetIndex);
        await navigateTo(destinationFor(target, { preferStart: true }));
    };

    const advance = () => {
        if (!canContinue || !current) return;

        // Progress is derived from recorded evidence. The button restores the
        // exact snapshot the next action or review requires.
        if (!atDestination && currentDestination) {
            void navigateTo(currentDestination);
            return;
        }

        if (pendingAcknowledge) {
            completeReview();
            return;
        }

        if (satisfied && nextDestination) {
            void navigateTo(nextDestination);
        }
    };

    return (
        <GuideActionsProvider
            value={{
                review:
                    current && reviewStep?.requires_tab
                        ? {
                              beatId: current.beat_id,
                              tab: reviewStep.requires_tab,
                              label: reviewStep.label,
                              complete: completeReview,
                          }
                        : null,
                activeIntentId,
                currentHref: targetHref,
                nextHref,
                nextTab,
                advance,
            }}
        >
            <ActiveReplayIntentProvider intentId={activeIntentId}>
                {workspace.guideCollapsed ? (
                <div className="border-b border-indigo-900/50 bg-indigo-950/30">
                    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2">
                        <Badge className="bg-indigo-600 text-white hover:bg-indigo-600">
                            <Sparkles className="mr-1 h-3 w-3" />
                            Guided replay
                        </Badge>
                        <span className="text-xs text-indigo-200/80">
                            Step {Math.min(index + 1, beats.length)} of {beats.length}
                        </span>
                        <span className="text-sm font-medium text-white">
                            {finished ? "Journey complete" : current?.title}
                        </span>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="ml-auto border-indigo-800 text-indigo-200 hover:bg-indigo-900/40"
                            onClick={() => workspace.setGuideCollapsed(false)}
                        >
                            Show guide
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="border-b border-indigo-900/50 bg-indigo-950/30">
                    <div className="mx-auto max-w-6xl px-4 py-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <Badge className="bg-indigo-600 text-white hover:bg-indigo-600">
                                <Sparkles className="mr-1 h-3 w-3" />
                                Guided replay
                            </Badge>
                            <span className="text-xs text-indigo-200/80">
                                Step {Math.min(index + 1, beats.length)} of {beats.length}
                            </span>
                            <span className="text-sm font-medium text-white">
                                {finished ? "Journey complete" : current?.title}
                            </span>
                            <div className="ml-auto flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="text-indigo-200 hover:bg-indigo-900/40"
                                    onClick={() => workspace.setGuideCollapsed(true)}
                                >
                                    Hide guide
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="border-indigo-800 text-indigo-200 hover:bg-indigo-900/40"
                                    disabled={!canResume || navigating}
                                    onClick={() => void resume()}
                                >
                                    <Play className="mr-1 h-4 w-4" />
                                    Resume guided journey
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="border-indigo-800 text-indigo-200 hover:bg-indigo-900/40"
                                    disabled={!canGoBack}
                                    onClick={() => void back()}
                                >
                                    <ArrowLeft className="mr-1 h-4 w-4" />
                                    Back
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="bg-indigo-600 hover:bg-indigo-700"
                                    disabled={!canContinue || navigating}
                                    onClick={advance}
                                >
                                    {pendingAcknowledge
                                        ? "Continue (acknowledge)"
                                        : "Continue"}
                                    <ArrowRight className="ml-1 h-4 w-4" />
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="text-indigo-200 hover:bg-indigo-900/40"
                                    onClick={restart}
                                >
                                    <RotateCcw className="mr-1 h-4 w-4" />
                                    Restart recording
                                </Button>
                            </div>
                        </div>

                        {finished ? (
                            <p className="mt-2 text-sm text-indigo-100/90" aria-live="polite">
                                The recorded meeting is archived and remains ended. Restart
                                the recording to replay the journey from the beginning.
                            </p>
                        ) : current ? (
                            <>
                                {!journeyRoute ? (
                                    <p
                                        className="mt-2 rounded-md border border-indigo-800/60 bg-indigo-950/40 px-2 py-1.5 text-xs text-indigo-100"
                                        role="status"
                                    >
                                        This page is outside the guided route. The recording
                                        is paused here and the journey has not advanced.
                                    </p>
                                ) : null}
                                <p className="mt-2 text-sm text-indigo-100/90">
                                    {current.objective}
                                </p>
                                {stepAssets.length > 0 ? (
                                    <div
                                        className="mt-2 flex flex-wrap items-center gap-1.5"
                                        data-testid="guide-step-documents"
                                    >
                                        <span className="text-[11px] font-medium uppercase tracking-wide text-indigo-200/60">
                                            Documents in this step
                                        </span>
                                        {stepAssets.map((asset) => {
                                            const label =
                                                descriptorForAsset(asset).title;
                                            const className =
                                                "inline-flex items-center gap-1 rounded-full border border-indigo-800/70 bg-indigo-950/40 px-2 py-0.5 text-xs font-medium text-indigo-200";
                                            const content = (
                                                <>
                                                    <FileText className="h-3 w-3" />
                                                    {label}
                                                </>
                                            );
                                            return stepDocumentsHref ? (
                                                <Link
                                                    key={asset.asset_id}
                                                    href={stepDocumentsHref}
                                                    data-testid={`guide-document-${asset.asset_id}`}
                                                    className={className}
                                                >
                                                    {content}
                                                </Link>
                                            ) : (
                                                <span
                                                    key={asset.asset_id}
                                                    data-testid={`guide-document-${asset.asset_id}`}
                                                    className={className}
                                                >
                                                    {content}
                                                </span>
                                            );
                                        })}
                                    </div>
                                ) : null}
                                {run.session.chapters.length > 0 ? (
                                    <details className="mt-2 rounded-md border border-indigo-800/60 bg-indigo-950/30 px-2 py-1.5">
                                        <summary className="cursor-pointer text-xs font-medium text-indigo-200">
                                            Chapters and inspection screens
                                        </summary>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                            {run.session.chapters.map((chapter) => (
                                                <Link
                                                    key={chapter.chapter_id}
                                                    href={chapterHref(
                                                        chapter,
                                                        run.session.meeting_id
                                                    )}
                                                    aria-current={
                                                        chapterParam === chapter.chapter_id
                                                            ? "page"
                                                            : undefined
                                                    }
                                                    className="text-xs font-medium text-indigo-300 underline underline-offset-2 aria-[current=page]:text-white"
                                                >
                                                    {chapter.title}
                                                </Link>
                                            ))}
                                        </div>
                                        <p className="mt-1 text-[11px] leading-relaxed text-indigo-200/60">
                                            Opening a chapter inspects its approved
                                            snapshot. It does not complete a guided
                                            step or create a new turn.
                                        </p>
                                    </details>
                                ) : null}
                                {workspace.expanded && highlightedPersonaId ? (
                                    <Link
                                        href={`/demo/roster/${highlightedPersonaId}/history`}
                                        className="mt-1 inline-block text-xs font-medium text-indigo-300 underline underline-offset-2"
                                    >
                                        Explore persona system-prompt history
                                    </Link>
                                ) : null}
                                <p className="mt-1 text-xs text-indigo-200/70" aria-live="polite">
                                    {satisfied
                                        ? "Recorded condition complete. Review the screen, then continue."
                                        : reviewTabLabel
                                          ? `Open the ${reviewTabLabel} tab and review the recorded result to continue.`
                                          : "Complete the supported action on this screen. The guide waits for the recorded result."}
                                </p>
                                {interruptedIntentIds.length > 0 ? (
                                    <p className="mt-1 text-xs text-amber-200/80">
                                        An interrupted prepared turn will restart from its
                                        approved start when you resume. Completed guide steps
                                        and practice edits stay in place.
                                    </p>
                                ) : null}
                                {!atDestination ? (
                                    <Link
                                        href={targetHref}
                                        onClick={(event) => {
                                            if (!currentDestination) return;
                                            event.preventDefault();
                                            void navigateTo(currentDestination);
                                        }}
                                        className="mt-2 inline-block text-xs font-medium text-indigo-300 underline underline-offset-2"
                                    >
                                        {journeyRoute
                                            ? "Open the current step"
                                            : "Return to the current guided step"}
                                    </Link>
                                ) : null}
                                {current.disclosure ? (
                                    <p className="mt-1 text-xs text-indigo-200/60">
                                        {current.disclosure}
                                    </p>
                                ) : null}
                            </>
                        ) : null}

                        {error ? (
                            <p
                                className="mt-2 rounded-md border border-red-800 bg-red-950/40 px-2 py-1 text-xs text-red-200"
                                role="alert"
                            >
                                {error}
                            </p>
                        ) : null}
                        <p className="mt-2 text-[11px] leading-relaxed text-indigo-200/60">
                            {run.session.disclosure}
                        </p>
                    </div>
                </div>
            )}
                {children}
            </ActiveReplayIntentProvider>
        </GuideActionsProvider>
    );
}
