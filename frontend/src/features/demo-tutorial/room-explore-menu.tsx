"use client";

import { useAnchorCandidates } from "./anchors";
import { ExploreRecordingMenu } from "./hud";
import { useModalOpen, useTutorialStreaming } from "./presence";
import { useDemoTutorialOptional } from "./provider";

/**
 * Room chrome can offer the recording map without assuming every meeting is a
 * demo. Live rooms render outside the tutorial provider, so this wrapper stays
 * inert there and the header guard only mounts it for replay.
 */
export function RoomExploreMenu() {
    const tutorial = useDemoTutorialOptional();
    const modalOpen = useModalOpen();
    const streaming = useTutorialStreaming();
    const anchor = tutorial?.prompt?.anchor ?? null;
    const match = useAnchorCandidates(anchor ? [anchor] : []);
    const inlinePrompt =
        tutorial?.prompt?.id === "main-speaker" ||
        tutorial?.prompt?.id === "main-followup";
    const inlineRoom = inlinePrompt && match !== null;
    if (!tutorial || !inlineRoom || tutorial.hidden || modalOpen || streaming) {
        return null;
    }

    return <ExploreRecordingMenu iconOnly />;
}
