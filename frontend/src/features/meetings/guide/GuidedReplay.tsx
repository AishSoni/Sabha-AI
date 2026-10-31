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
import { ArrowLeft, ArrowRight, Play, RotateCcw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReplayBeat, ReplayBeatStep } from "../runtime/contract";
import { chapterHref } from "../runtime/chapters";
import { useReplayRun } from "../runtime/replay-run";
import { useDemoWorkspace } from "@/features/demo-workspace";
import { ActiveReplayIntentProvider } from "../runtime/active-intent";

function beatHref(beat: ReplayBeat, meetingId: string): string {
    if (beat.route === "board") return "/demo";
    if (beat.route === "new") return "/demo/new";
    if (beat.route === "list") return "/demo/meetings";
    const tab = beat.tab ? `?tab=${encodeURIComponent(beat.tab)}` : "";
    return `/demo/meetings/${encodeURIComponent(meetingId)}${tab}`;
}

function beatMatchesLocation(
    beat: ReplayBeat,
    meetingId: string,
    pathname: string,
    tab: string | null
): boolean {
    const target = new URL(beatHref(beat, meetingId), "http://sabha.local");
    return pathname === target.pathname && tab === target.searchParams.get("tab");
}

function stepSatisfied(
    step: ReplayBeatStep,
    beat: ReplayBeat,
    run: ReturnType<typeof useReplayRun>
): boolean {
    if (step.completion === "acknowledge") {
        return run.acknowledgedBeats.has(beat.beat_id);
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
    const [error, setError] = useState<string | null>(null);

    const beats = useMemo(() => {
        return [...run.session.beats].sort((left, right) => {
            const a = left.ordinal ?? Number.MAX_SAFE_INTEGER;
            const b = right.ordinal ?? Number.MAX_SAFE_INTEGER;
            return a - b;
        });
    }, [run.session.beats]);

    const beatSatisfied = (beat: ReplayBeat) =>
        beat.steps.every((step) => stepSatisfied(step, beat, run));

    /**
     * Progress is recorded evidence, never the ordinal of the snapshot the
     * visitor happens to be inspecting. A branch action or a chapter detour
     * cannot complete a canonical beat, and jumping to a later snapshot cannot
     * make an unfinished beat look done.
     */
    const index = (() => {
        for (let i = 0; i < beats.length; i += 1) {
            if (!beatSatisfied(beats[i])) return i;
        }
        return beats.length;
    })();

    const finished = index >= beats.length;
    const current = beats[index] ?? null;
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

    const activeStep = current?.steps.find(
        (step) => step.intent_id && !stepSatisfied(step, current, run)
    );
    const activeIntentId = current
        ? (activeStep?.intent_id ?? "__guided-none__")
        : "__guided-none__";
    const satisfied = current ? beatSatisfied(current) : false;
    const pendingAcknowledge = current
        ? current.steps.some(
              (step) =>
                  step.completion === "acknowledge" &&
                  !stepSatisfied(step, current, run)
          )
        : false;
    const targetHref = current
        ? beatHref(current, run.session.meeting_id)
        : "/demo";
    const onTarget = current
        ? beatMatchesLocation(
              current,
              run.session.meeting_id,
              pathname,
              tab
          )
        : false;
    const nextHref =
        current && index < beats.length - 1
            ? beatHref(beats[index + 1], run.session.meeting_id)
            : null;
    const canContinue =
        !finished &&
        current !== null &&
        (!onTarget ||
            pendingAcknowledge ||
            (satisfied &&
                index < beats.length - 1 &&
                nextHref !== targetHref));
    const canGoBack = !navigating && (index > 0 || finished);
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

    const restart = () => {
        workspace.restartRecording();
        router.push("/demo");
    };

    const resume = async () => {
        if (!current && !finished) return;
        setNavigating(true);
        setError(null);
        try {
            if (interruptedIntentIds.length > 0) {
                for (const intentId of interruptedIntentIds) {
                    await run.replayIntent(intentId);
                }
            } else {
                const target = finished
                    ? beats[beats.length - 1]
                    : current;
                const checkpoint =
                    target?.start_checkpoint ?? target?.checkpoint;
                if (checkpoint) {
                    await run.switchCheckpoint(checkpoint, { force: true });
                }
            }
            const target = current ?? beats[beats.length - 1];
            if (target) router.push(beatHref(target, run.session.meeting_id));
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "The bookmarked guided position could not be restored."
            );
        } finally {
            setNavigating(false);
        }
    };

    const back = async () => {
        if (!canGoBack) return;
        const targetIndex = finished ? beats.length - 1 : index - 1;
        const target = beats[targetIndex];
        if (!target) return;

        setNavigating(true);
        setError(null);
        try {
            // Back only moves the exploration cursor. Completed canonical
            // actions stay complete, so the guide never rewinds evidence.
            const checkpoint = target.start_checkpoint ?? target.checkpoint;
            if (checkpoint && checkpoint !== run.checkpoint) {
                await run.switchCheckpoint(checkpoint);
            }
            router.push(beatHref(target, run.session.meeting_id));
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "The previous recorded step could not be restored."
            );
        } finally {
            setNavigating(false);
        }
    };

    const advance = () => {
        if (!canContinue || !current) return;

        // Progress is derived from recorded evidence. The button only brings
        // the visitor to the current beat's screen or acknowledges a review.
        if (!onTarget) {
            router.push(targetHref);
            return;
        }

        if (pendingAcknowledge) {
            run.acknowledgeBeat(current.beat_id);
            const completesBeat = current.steps.every(
                (step) =>
                    step.completion === "acknowledge" ||
                    stepSatisfied(step, current, run)
            );
            if (completesBeat && nextHref) router.push(nextHref);
            return;
        }

        if (satisfied && nextHref) {
            router.push(nextHref);
        }
    };

    return (
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
                                        : "Complete the supported action on this screen. The guide waits for the recorded result."}
                                </p>
                                {interruptedIntentIds.length > 0 ? (
                                    <p className="mt-1 text-xs text-amber-200/80">
                                        An interrupted prepared turn will restart from its
                                        approved start when you resume. Completed guide steps
                                        and practice edits stay in place.
                                    </p>
                                ) : null}
                                {!onTarget ? (
                                    <Link
                                        href={targetHref}
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
    );
}
