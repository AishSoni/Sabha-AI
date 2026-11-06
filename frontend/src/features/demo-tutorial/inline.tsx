"use client";

import { Sparkles } from "lucide-react";

import { useDemoTutorialOptional } from "./provider";
import { useModalOpen, useTutorialStreaming } from "./presence";
import { tutorialProgress } from "./progress";

/**
 * Room-local tutorial strip. The main journey's reply steps live beside the
 * controls they describe instead of floating over the transcript. Other
 * objectives keep the shared anchored HUD.
 */
export function RoomTutorialInline() {
  const tutorial = useDemoTutorialOptional();
  const modalOpen = useModalOpen();
  const streaming = useTutorialStreaming();
  const prompt = tutorial?.prompt;

  if (!tutorial || !prompt || tutorial.hidden || modalOpen || streaming) {
    return null;
  }
  if (prompt.id !== "main-speaker" && prompt.id !== "main-followup") {
    return null;
  }

  const progress = tutorialProgress(prompt, tutorial.journey);

  return (
    <div
      role="region"
      aria-label="Demo tutorial"
      data-testid="tutorial-hud"
      data-placement="inline"
      data-state="shown"
      className="m-notice flex flex-wrap items-center gap-x-2 gap-y-1 rounded-control border border-action/30 bg-accent-soft/70 px-3 py-2 text-ink"
    >
      {progress ? (
        <div
          role="progressbar"
          aria-label="Demo progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-valuetext={progress.label}
          className="sr-only"
        />
      ) : null}
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
      <button
        type="button"
        onClick={tutorial.hide}
        className="m-control ml-auto inline-flex min-h-8 items-center rounded-control px-2 py-1 type-meta text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        Hide
      </button>
    </div>
  );
}
