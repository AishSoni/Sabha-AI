import {
    INTRO_STORAGE_KEY,
    INTRO_STORAGE_VALUE,
} from "@/features/demo-intro/steps";

/**
 * Journey tests start after the introduction has been acknowledged, matching
 * an ordinary reload in the same browser tab.
 */
export function acknowledgeDemoIntro(): void {
    window.sessionStorage.setItem(INTRO_STORAGE_KEY, INTRO_STORAGE_VALUE);
}

export function resetDemoIntro(): void {
    window.sessionStorage.removeItem(INTRO_STORAGE_KEY);
}
