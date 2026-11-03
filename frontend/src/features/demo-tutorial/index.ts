/**
 * Public interface of the demo tutorial feature (spec-30).
 *
 * Other features observe the tutorial through anchors, presence flags and
 * named outcomes. The shell (provider, HUD, notices) is mounted only by the
 * demo route inside `src/app/demo`, so it stays out of this barrel.
 */
export {
    getAnchor,
    registerAnchor,
    resetAnchorRegistry,
    useAnchorCandidates,
    useAnchorElement,
    useAnchorRef,
    useAnchorVersion,
} from "./anchors";
export {
    TUTORIAL_ANCHOR_IDS,
    anchorForIntent,
    type TutorialAnchorId,
} from "./contract";
export {
    clearTutorialFacts,
    markTutorialFact,
    setTutorialBusy,
    useModalOpen,
    useTutorialFact,
    useTutorialStreaming,
    useTutorialStreamingFlag,
} from "./presence";
