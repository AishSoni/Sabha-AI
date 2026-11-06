"use client";

import { usePathname } from "next/navigation";

import { isRoomPath } from "./journey";
import { TutorialCompact, TutorialPresentation } from "./presentation";
import { useModalOpen, useTutorialStreaming } from "./presence";
import { tutorialProgress } from "./progress";
import { useDemoTutorial } from "./provider";

/**
 * Reserved shell rail for non-room routes.
 *
 * The rail is in flow, so it reserves its own height instead of covering the
 * control it describes. Room routes own their instruction strip in the dock.
 */
export function TutorialRail() {
  const tutorial = useDemoTutorial();
  const pathname = usePathname() ?? "/demo";
  const modalOpen = useModalOpen();
  const streaming = useTutorialStreaming();

  if (isRoomPath(pathname) || !tutorial.prompt || modalOpen || streaming) {
    return null;
  }

  if (tutorial.hidden) return <TutorialCompact />;

  return (
    <TutorialPresentation
      prompt={tutorial.prompt}
      progress={tutorialProgress(tutorial.prompt, tutorial.journey)}
      variant="rail"
    />
  );
}
