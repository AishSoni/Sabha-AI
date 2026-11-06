"use client";

import { Sparkles } from "lucide-react";
import type { TutorialPrompt } from "./contract";
import { ExploreRecordingMenu } from "./explore-menu";
import type { TutorialProgress } from "./progress";
import { useDemoTutorial } from "./provider";

/**
 * One tutorial surface for every screen. The floating card and the room strip
 * share the progress rail, instruction and guide menu; only their container
 * and typography differ.
 */
export function TutorialGuide({
    prompt,
    progress,
    variant,
}: {
    prompt: TutorialPrompt;
    progress: TutorialProgress | null;
    variant: "card" | "inline";
}) {
    const tutorial = useDemoTutorial();
    const card = variant === "card";

    return (
        <div
            role="region"
            aria-label="Demo tutorial"
            data-testid="tutorial-hud"
            data-placement={variant}
            data-state="shown"
            className={`m-notice relative overflow-hidden text-ink ${
                card
                    ? "rounded-group border border-action/40 bg-surface shadow-[var(--shadow-overlay)]"
                    : "rounded-control border border-action/30 bg-accent-soft/70"
            }`}
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
            <div className={card ? "p-3" : "px-3 py-2"}>
                <div
                    className={`flex gap-2 ${
                        card ? "items-start" : "items-center"
                    }`}
                >
                    <Sparkles
                        className={`size-4 shrink-0 text-action ${
                            card ? "mt-0.5" : ""
                        }`}
                        aria-hidden="true"
                    />
                    <p
                        className={`min-w-0 flex-1 font-medium ${
                            card ? "type-body" : "type-meta"
                        }`}
                    >
                        {prompt.instruction}
                    </p>
                    <ExploreRecordingMenu iconOnly />
                </div>
                {prompt.complete ? (
                    <p
                        className={`type-meta text-ink-secondary ${
                            card ? "mt-2" : "mt-1"
                        }`}
                    >
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
