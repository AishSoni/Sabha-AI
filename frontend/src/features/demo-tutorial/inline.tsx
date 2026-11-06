"use client";

import { TutorialGuide } from "./guide";
import { useDemoTutorialOptional } from "./provider";
import { useModalOpen, useTutorialStreaming } from "./presence";
import { tutorialProgress } from "./progress";

/**
 * Room-local tutorial strip. It renders the same guide surface as the floating
 * card so the progress rail, instruction and guide menu cannot drift apart.
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

  return (
    <TutorialGuide
      prompt={prompt}
      progress={tutorialProgress(prompt, tutorial.journey)}
      variant="inline"
    />
  );
}
