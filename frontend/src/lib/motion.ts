/**
 * Motion-preference helpers. The reduced-motion path must never force
 * animated scrolling or animation delays on the user.
 */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Scroll behavior for programmatic scrolls: instant under reduced motion. */
export function preferredScrollBehavior(): ScrollBehavior {
    return prefersReducedMotion() ? 'auto' : 'smooth';
}
