import type { ReplayChapter } from "./contract";

/**
 * Approved chapter destinations (spec-26).
 *
 * A chapter is a pinned package record: the URL only names the chapter. The
 * browser never derives a checkpoint, route, or tab from an arbitrary query.
 */
export function chapterHref(
    chapter: ReplayChapter,
    meetingId: string
): string {
    const query = `?chapter=${encodeURIComponent(
        chapter.chapter_id
    )}&tab=${encodeURIComponent(chapter.tab)}`;
    if (chapter.route === "board") return `/demo${query}`;
    if (chapter.route === "new") return `/demo/new${query}`;
    if (chapter.route === "list") return `/demo/meetings${query}`;
    return `/demo/meetings/${encodeURIComponent(meetingId)}${query}`;
}

export function chapterPathMatches(
    chapter: ReplayChapter,
    meetingId: string,
    pathname: string
): boolean {
    if (chapter.route === "board") return pathname === "/demo";
    if (chapter.route === "new") return pathname === "/demo/new";
    if (chapter.route === "list") return pathname === "/demo/meetings";
    return pathname === `/demo/meetings/${meetingId}`;
}

/**
 * The chapter's tab is part of the approved record. An explicit tab may only
 * restate it; it can never widen the chapter to another screen.
 */
export function chapterTab(
    chapter: ReplayChapter,
    requestedTab: string | null
): string | null {
    if (requestedTab && requestedTab !== chapter.tab) return null;
    return chapter.tab;
}
