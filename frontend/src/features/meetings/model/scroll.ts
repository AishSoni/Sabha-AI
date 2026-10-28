export const SCROLL_STICK_THRESHOLD_PX = 96;

export interface ScrollMetrics {
    scrollHeight: number;
    scrollTop: number;
    clientHeight: number;
}

export function isNearScrollBottom(
    metrics: ScrollMetrics,
    threshold = SCROLL_STICK_THRESHOLD_PX
): boolean {
    return (
        metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <=
        threshold
    );
}

export function scrollBehavior(reducedMotion: boolean): ScrollBehavior {
    return reducedMotion ? 'auto' : 'smooth';
}
