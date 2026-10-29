"use client";

/**
 * Guided replay controller and panel (spec-18).
 *
 * The guide owns only the step order, stable anchors, route/tab hints, and
 * Continue/Back/Restart. It never clicks DOM controls or invents meeting state.
 * A step completes only when the recorded package condition is present.
 */
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReplayBeat, ReplayBeatStep } from "../runtime/contract";
import { useReplayRun } from "../runtime/replay-run";
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
    if (step.completion === "acknowledge") return true;
    if (!step.intent_id) return false;
    if (step.completion === "closing_completed" && !run.closingSettled) {
        return false;
    }
    if (!run.settledIntents.has(step.intent_id)) return false;
    const intent = run.session.intents.find(
        (item) => item.intent_id === step.intent_id
    );
    if (!intent) return false;
    let destination: string | null = null;
    if (step.completion === "closing_completed") {
        destination = beat.completed_checkpoint;
    } else if (step.completion === "checkpoint") {
        destination = intent.checkpoint;
    } else {
        const tape = run.session.tapes.find(
            (item) => item.tape_id === intent.tape_id
        );
        destination = tape?.completed_checkpoint ?? null;
    }
    if (!destination) return false;
    const destinationIndex = run.session.checkpoints.indexOf(destination);
    const currentIndex = run.session.checkpoints.indexOf(run.checkpoint);
    return (
        destinationIndex >= 0 &&
        currentIndex >= 0 &&
        destinationIndex <= currentIndex
    );
}

export function GuidedReplay({ children }: { children: ReactNode }) {
    const run = useReplayRun();
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
     * The checkpoint is the single source of truth for progress. Derive the
     * current beat from it instead of keeping a second, independently mutable
     * step counter. When a recorded action settles, the checkpoint moves and
     * the guide advances in the same render.
     */
    const index = (() => {
        if (beats.length === 0) return 0;

        let candidate = 0;
        if (run.checkpoint === run.session.initial_checkpoint) {
            // The board and the intake form share the initial checkpoint.
            // Their route disambiguates which beat is current.
            const routeIndex = beats.findIndex(
                (beat) =>
                    beat.checkpoint === run.checkpoint &&
                    beatMatchesLocation(
                        beat,
                        run.session.meeting_id,
                        pathname,
                        tab
                    )
            );
            candidate = routeIndex >= 0 ? routeIndex : 0;
        } else {
            const position = run.session.checkpoints.indexOf(run.checkpoint);
            for (let i = 0; i < beats.length; i += 1) {
                const beat = beats[i];
                const start = run.session.checkpoints.indexOf(
                    beat.start_checkpoint ?? beat.checkpoint
                );
                const end = run.session.checkpoints.indexOf(
                    beat.completed_checkpoint ?? beat.checkpoint
                );
                if (start >= 0 && end >= 0 && position >= start && position < end) {
                    candidate = i;
                    break;
                }
            }
            if (
                beats[beats.length - 1]?.completed_checkpoint === run.checkpoint
            ) {
                candidate = beats.length;
            } else if (candidate === 0) {
                // A checkpoint can be the start of a beat without being inside
                // the previous beat's half-open interval (notably the last
                // beat's start checkpoint, which has no following beat).
                const startIndex = beats.findIndex(
                    (beat) =>
                        (beat.start_checkpoint ?? beat.checkpoint) ===
                        run.checkpoint
                );
                if (startIndex >= 0) candidate = startIndex;
            }
        }

        // Never move into a beat whose recorded result has not happened yet.
        // This keeps the closing beat visible until its terminal settles even
        // though requesting the closing switches the checkpoint early.
        while (candidate > 0) {
            const previous = beats[Math.min(candidate, beats.length) - 1];
            if (beatSatisfied(previous)) break;
            candidate = Math.min(candidate, beats.length) - 1;
        }

        return candidate;
    })();

    const finished = index >= beats.length;
    const current = beats[index] ?? null;
    const activeStep = current?.steps.find(
        (step) => step.intent_id && !stepSatisfied(step, current, run)
    );
    const activeIntentId = current
        ? (activeStep?.intent_id ?? "__guided-none__")
        : "__guided-none__";
    const satisfied = current ? beatSatisfied(current) : false;
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
            (satisfied &&
                index < beats.length - 1 &&
                nextHref !== targetHref));
    const canGoBack = !navigating && (index > 0 || finished);

    const restart = () => {
        run.restart();
        router.push("/demo");
    };

    const back = async () => {
        if (!canGoBack) return;
        const targetIndex = finished ? beats.length - 1 : index - 1;
        const target = beats[targetIndex];
        if (!target) return;

        setNavigating(true);
        setError(null);
        try {
            // Restore the state before the target beat ran. Using the target
            // beat's start checkpoint (rather than the previous completed
            // checkpoint) is what makes the derived index move backwards.
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

        // Progress has already moved the counter when an action settles. The
        // button's job is to bring the UI to the current beat's screen.
        if (!onTarget) {
            router.push(targetHref);
            return;
        }

        // Acknowledge-only beats do not change the checkpoint, so Continue is
        // the action that moves to the next screen.
        if (satisfied && index < beats.length - 1) {
            const next = beats[index + 1];
            router.push(beatHref(next, run.session.meeting_id));
        }
    };

    return (
        <ActiveReplayIntentProvider intentId={activeIntentId}>
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
                                Continue
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
                                Restart
                            </Button>
                        </div>
                    </div>

                    {finished ? (
                        <p className="mt-2 text-sm text-indigo-100/90" aria-live="polite">
                            The recorded meeting is archived and remains ended. Restart
                            to replay the journey from the beginning.
                        </p>
                    ) : current ? (
                        <>
                            <p className="mt-2 text-sm text-indigo-100/90">
                                {current.objective}
                            </p>
                            <p className="mt-1 text-xs text-indigo-200/70" aria-live="polite">
                                {satisfied
                                    ? "Recorded condition complete. Review the screen, then continue."
                                    : "Complete the supported action on this screen. The guide waits for the recorded result."}
                            </p>
                            {!onTarget ? (
                                <Link
                                    href={targetHref}
                                    className="mt-2 inline-block text-xs font-medium text-indigo-300 underline underline-offset-2"
                                >
                                    Open the current step
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
            {children}
        </ActiveReplayIntentProvider>
    );
}
