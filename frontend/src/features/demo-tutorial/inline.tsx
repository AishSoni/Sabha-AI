"use client";

import { TutorialCompact, TutorialPresentation } from "./presentation";
import { useDemoTutorialOptional } from "./provider";
import { useModalOpen, useTutorialStreaming } from "./presence";
import { tutorialProgress } from "./progress";

/**
 * Room-local tutorial strip. Every room objective renders here, in the dock
 * above the controls it describes, instead of floating over the transcript.
 */
export function RoomTutorialInline() {
  const tutorial = useDemoTutorialOptional();
  const modalOpen = useModalOpen();
  const streaming = useTutorialStreaming();
  const prompt = tutorial?.prompt;

  if (!tutorial || !prompt || modalOpen || streaming) {
    return null;
  }

  if (tutorial.hidden) return <TutorialCompact />;

  return (
    <TutorialPresentation
      prompt={prompt}
      progress={tutorialProgress(prompt, tutorial.journey)}
      variant="inline"
    />
  );
}
