"use client";

import { useState, type ReactNode } from "react";
import { HelpCircle, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { ExploreRecordingMenu } from "./hud";
import { useDemoTutorial } from "./provider";
import type { TutorialProgress } from "./progress";
import type { TutorialPrompt } from "./contract";

const HELP: Record<string, string> = {
  "main-speaker":
    "Choose one of the available recorded replies. The room will play the recorded turn; no live inference runs.",
  "main-followup":
    "The question is fixed in the recording. Expanding it does not send it or change which participant speaks next.",
  "main-close":
    "Close the discussion once the recorded replies you need have played. The closing entry stays in this browser.",
  "main-vote":
    "The vote is a recorded response. It does not change the underlying meeting or call a live model.",
  "main-return":
    "The room stays readable after the meeting ends. Returning to the board keeps the recording in this browser.",
  "main-archive":
    "Archiving files the recorded meeting in the demo list. It does not publish or delete anything.",
  "main-complete":
    "The main journey is complete. The two tours are optional and only change what this browser shows.",
};

const DEFAULT_HELP =
  "This optional tour is read-only. It never changes the recording, the meeting or a practice workspace.";

/**
 * One tutorial presentation for every placement.
 *
 * The progress rail is absolutely positioned against the bordered container so
 * it stays flush to the top edge at every width. The rail is part of the
 * presentation rather than a separate floating card.
 */
export function TutorialPresentation({
  prompt,
  progress,
  variant,
}: {
  prompt: TutorialPrompt;
  progress: TutorialProgress | null;
  variant: "rail" | "inline";
}) {
  const tutorial = useDemoTutorial();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div
      role="region"
      aria-label="Demo tutorial"
      data-testid="tutorial-hud"
      data-placement={variant}
      data-state="shown"
      className={cn(
        "m-notice relative flex w-full shrink-0 flex-wrap items-center overflow-hidden border border-action/30 text-ink",
        variant === "rail"
          ? "gap-x-3 gap-y-1 bg-surface px-4 py-2"
          : "gap-x-2 gap-y-1 rounded-control bg-accent-soft/70 px-3 py-2"
      )}
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

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <Sparkles className="size-4 shrink-0 text-action" aria-hidden="true" />
        <p className="type-meta font-medium">{prompt.instruction}</p>
        {prompt.progress ? (
          <>
            <span className="type-meta text-ink-muted" aria-hidden="true">
              ·
            </span>
            <p className="type-meta text-ink-secondary">{prompt.progress}</p>
          </>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <ExploreRecordingMenu iconOnly />
        <button
          type="button"
          onClick={() => setHelpOpen((open) => !open)}
          aria-expanded={helpOpen}
          className="m-control inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-control px-2 py-1 type-meta text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <HelpCircle className="size-4" aria-hidden="true" />
          Help
        </button>
        <button
          type="button"
          onClick={tutorial.hide}
          className="m-control inline-flex min-h-8 items-center rounded-control px-2 py-1 type-meta text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Hide
        </button>
      </div>

      {helpOpen ? (
        <p className="w-full type-meta text-ink-secondary">
          {HELP[prompt.id] ?? DEFAULT_HELP}
        </p>
      ) : null}

      {prompt.complete ? (
        <p className="w-full type-meta text-ink-secondary">
          {prompt.id === "main-complete"
            ? "The recorded meeting is archived. Practice edits stay in this browser. Both tours are optional."
            : "Nothing was saved or activated. The recording is unchanged."}
        </p>
      ) : null}

      {prompt.id === "tour-prompt-4" || prompt.id === "tour-knowledge-4" ? (
        <div className="flex w-full flex-wrap gap-1.5">
          <TourAction onClick={tutorial.endTour}>Finish tour</TourAction>
          <TourAction onClick={tutorial.backToDemo}>Back to demo</TourAction>
        </div>
      ) : prompt.id === "main-complete" ? (
        <div className="flex w-full flex-wrap gap-1.5">
          <TourAction onClick={() => tutorial.startTour("prompt")}>
            Explore prompt versions
          </TourAction>
          <TourAction onClick={() => tutorial.startTour("knowledge")}>
            Explore knowledge stacks
          </TourAction>
          <TourAction onClick={tutorial.hide}>Finish</TourAction>
        </div>
      ) : tutorial.activeTour ? (
        <div className="flex w-full justify-end">
          <TourAction onClick={tutorial.endTour}>End tour</TourAction>
        </div>
      ) : null}
    </div>
  );
}

export function TutorialCompact() {
  const tutorial = useDemoTutorial();

  return (
    <div
      data-testid="tutorial-hud-compact"
      className="m-notice flex w-full shrink-0 flex-wrap items-center gap-1 border border-action/30 bg-surface px-2 py-1"
    >
      <button
        type="button"
        onClick={tutorial.show}
        aria-expanded={!tutorial.hidden}
        className="m-control inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 py-1 type-meta font-medium text-action hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <Sparkles className="size-4" aria-hidden="true" />
        Show tips
      </button>
      <ExploreRecordingMenu />
    </div>
  );
}

function TourAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
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
