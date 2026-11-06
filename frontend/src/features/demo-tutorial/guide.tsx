"use client";

import { Sparkles } from "lucide-react";
import type { TutorialPrompt } from "./contract";
import { ExploreRecordingMenu } from "./explore-menu";
import type { TutorialProgress } from "./progress";
import { useDemoTutorial } from "./provider";

/**
 * One tutorial surface for every screen. The floating card and the room strip
 * share the same container, progress rail, instruction and guide menu; only
 * their placement and width differ.
 */
export function TutorialGuide({
    prompt,
    progress,
    placement,
}: {
    prompt: TutorialPrompt;
    progress: TutorialProgress | null;
    placement: "card" | "inline";
}) {
    const tutorial = useDemoTutorial();

    return (
        <div
            role="region"
            aria-label="Demo tutorial"
            data-testid="tutorial-hud"
            data-placement={placement}
            data-state="shown"
            className="m-notice material-glass-card relative overflow-hidden rounded-group border border-action/40 text-ink"
        >
            {progress ? (
                <div
                    role="progressbar"
                    aria-label="Demo progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress.percent}
                    aria-valuetext={progress.label}
                    data-testid="tutorial-progress"
                    className="absolute inset-x-0 top-0 h-1.5 w-full overflow-hidden bg-surface-raised"
                >
                    <div
                        className="m-progress-fill h-full bg-action"
                        style={{ width: `${progress.percent}%` }}
                    />
                </div>
            ) : null}
            <div className="px-3 py-2">
                <div className="flex items-center gap-2">
                    <Sparkles
                        className="size-4 shrink-0 text-action"
                        aria-hidden="true"
                    />
                    <p className="min-w-0 flex-1 type-meta font-medium">
                        {prompt.instruction}
                    </p>
                    <ExploreRecordingMenu iconOnly />
                </div>
                {prompt.complete ? (
                    <p className="mt-1 type-meta text-ink-secondary">
                        {prompt.id === "main-complete"
                            ? "The recorded meeting is archived. Practice edits stay in this browser. Both tours are optional."
                            : "Nothing was saved or activated. The recording is unchanged."}
                    </p>
                ) : null}
                {prompt.id === "tour-prompt-4" ||
                prompt.id === "tour-knowledge-4" ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <TourAction onClick={tutorial.endTour}>
                            Finish tour
                        </TourAction>
                        <TourAction onClick={tutorial.backToDemo}>
                            Back to demo
                        </TourAction>
                    </div>
                ) : prompt.id === "main-complete" ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <TourAction onClick={() => tutorial.startTour("prompt")}>
                            Explore prompt versions
                        </TourAction>
                        <TourAction
                            onClick={() => tutorial.startTour("knowledge")}
                        >
                            Explore knowledge stacks
                        </TourAction>
                        <TourAction onClick={tutorial.hide}>Finish</TourAction>
                    </div>
                ) : tutorial.activeTour ? (
                    <div className="mt-2 flex justify-end">
                        <TourAction onClick={tutorial.endTour}>
                            End tour
                        </TourAction>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function TourAction({
    onClick,
    children,
}: {
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="m-control rounded-full border border-action/40 px-2.5 py-0.5 type-meta font-medium text-action hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
            {children}
        </button>
    );
}
