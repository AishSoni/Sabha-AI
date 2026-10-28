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
import { usePathname, useRouter } from "next/navigation";
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

function stepSatisfied(
    step: ReplayBeatStep,
    run: ReturnType<typeof useReplayRun>
): boolean {
    if (step.completion === "acknowledge") return true;
    if (step.completion === "closing_completed") return run.closingSettled;
    if (!step.intent_id) return false;
    return run.settledIntents.has(step.intent_id);
}

export function GuidedReplay({ children }: { children: ReactNode }) {
    const run = useReplayRun();
    const router = useRouter();
    const pathname = usePathname();
    const [index, setIndex] = useState(0);
    const [finished, setFinished] = useState(false);

    const beats = useMemo(() => {
        return [...run.session.beats].sort((left, right) => {
            const a = left.ordinal ?? Number.MAX_SAFE_INTEGER;
            const b = right.ordinal ?? Number.MAX_SAFE_INTEGER;
            return a - b;
        });
    }, [run.session.beats]);

    const current = beats[index] ?? null;
    const activeStep = current?.steps.find(
        (step) => step.intent_id && !stepSatisfied(step, run)
    );
    const activeIntentId = current
        ? (activeStep?.intent_id ?? "__guided-none__")
        : null;
    const satisfied = current
        ? current.steps.every((step) => stepSatisfied(step, run))
        : false;
    const targetHref = current
        ? beatHref(current, run.session.meeting_id)
        : "/demo";
    const onTarget = pathname === targetHref.split("?")[0];
    const isLast = index >= beats.length - 1;

    const restart = () => {
        run.restart();
        setIndex(0);
        setFinished(false);
        router.push("/demo");
    };

    const back = async () => {
        if (index === 0) return;
        const previous = beats[index - 1];
        const nextIndex = index - 1;
        setIndex(nextIndex);
        setFinished(false);
        if (previous.completed_checkpoint) {
            try {
                await run.switchCheckpoint(previous.completed_checkpoint);
            } catch {
                // The guide stays on the previous step; the checkpoint error is
                // surfaced by the room/read layer, not hidden.
            }
        }
        router.push(beatHref(previous, run.session.meeting_id));
    };

    const advance = () => {
        if (!current || !satisfied) return;
        if (isLast) {
            setFinished(true);
            return;
        }
        const next = beats[index + 1];
        setIndex(index + 1);
        router.push(beatHref(next, run.session.meeting_id));
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
                                disabled={index === 0}
                                onClick={() => void back()}
                            >
                                <ArrowLeft className="mr-1 h-4 w-4" />
                                Back
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700"
                                disabled={!satisfied || finished}
                                onClick={advance}
                            >
                                {isLast ? "Finish" : "Continue"}
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

                    <p className="mt-2 text-[11px] leading-relaxed text-indigo-200/60">
                        {run.session.disclosure}
                    </p>
                </div>
            </div>
            {children}
        </ActiveReplayIntentProvider>
    );
}
