export type IntroCardKind =
    | "question"
    | "participant"
    | "position"
    | "source"
    | "outcome"
    | "speaker"
    | "followup"
    | "fact"
    | "lens"
    | "qualifier";

export type IntroCardTone = "accent" | "muted" | "warning" | "success";

export interface IntroCardData {
    title: string;
    body?: string;
    participantId?: string;
    rows?: readonly { label: string; value: string }[];
    tone?: IntroCardTone;
}

export interface IntroAnchor {
    x: number;
    y: number;
    z: number;
    width: number;
}

export interface IntroCardNode {
    id: string;
    moment: number;
    kind: IntroCardKind;
    height: number;
    data: IntroCardData;
    desktop: IntroAnchor;
    mobile: IntroAnchor;
}

export interface IntroCopyAnchor {
    moment: number;
    desktop: IntroAnchor;
    mobile: IntroAnchor;
}

export const INTRO_CAMERA = {
    fov: 45,
    near: 0.1,
    far: 140,
    stopGap: 9,
    desktopReadDistance: 9,
    mobileReadDistance: 14,
} as const;

export const INTRO_COPY_ANCHORS: readonly IntroCopyAnchor[] = [
    {
        moment: 0,
        desktop: { x: -1.1, y: 2.25, z: 0.2, width: 7.2 },
        mobile: { x: 0, y: 4.3, z: 0.2, width: 4.8 },
    },
    {
        moment: 1,
        desktop: { x: 1.0, y: 2.2, z: 0.2, width: 7.0 },
        mobile: { x: 0, y: 4.2, z: 0.2, width: 4.8 },
    },
    {
        moment: 2,
        desktop: { x: -1.8, y: -1.85, z: 0.2, width: 5.8 },
        mobile: { x: 0, y: -3.7, z: 0.2, width: 4.8 },
    },
    {
        moment: 3,
        desktop: { x: -1.2, y: 2.25, z: 0.2, width: 7.0 },
        mobile: { x: 0, y: 4.25, z: 0.2, width: 4.8 },
    },
] as const;

export const INTRO_CARD_NODES: readonly IntroCardNode[] = [
    // 1. The idea: one question, three different minds, and the user's choice.
    {
        id: "idea-question",
        moment: 0,
        kind: "question",
        height: 1.15,
        data: {
            title: "Should we proceed?",
        },
        desktop: { x: 3.85, y: 1.25, z: 0.25, width: 3.4 },
        mobile: { x: 0, y: 1.75, z: 0.2, width: 4.4 },
    },
    {
        id: "idea-mira",
        moment: 0,
        kind: "participant",
        height: 1.0,
        data: {
            participantId: "mira",
            title: "Mira",
            body: "Credit Analyst",
        },
        desktop: { x: -1.9, y: -0.45, z: 0.55, width: 2.7 },
        mobile: { x: 0, y: 0.55, z: 0.4, width: 4.4 },
    },
    {
        id: "idea-arjun",
        moment: 0,
        kind: "participant",
        height: 1.0,
        data: {
            participantId: "arjun",
            title: "Arjun",
            body: "Downside Reviewer",
        },
        desktop: { x: 0.55, y: -0.75, z: 0.2, width: 2.7 },
        mobile: { x: 0, y: -0.5, z: 0.2, width: 4.4 },
    },
    {
        id: "idea-leena",
        moment: 0,
        kind: "participant",
        height: 1.0,
        data: {
            participantId: "leena",
            title: "Leena",
            body: "Portfolio Analyst",
        },
        desktop: { x: 2.9, y: -1.1, z: -0.15, width: 2.7 },
        mobile: { x: 0, y: -1.55, z: -0.1, width: 4.4 },
    },
    // 2. The value: two readings, a shared source, and the kept outcome.
    {
        id: "value-position-a",
        moment: 1,
        kind: "position",
        height: 1.15,
        data: {
            title: "The terms hold.",
            body: "Start with the dated record.",
            tone: "accent",
        },
        desktop: { x: -3.35, y: 0.35, z: 0.45, width: 3.2 },
        mobile: { x: 0, y: 1.5, z: 0.4, width: 4.4 },
    },
    {
        id: "value-position-b",
        moment: 1,
        kind: "position",
        height: 1.15,
        data: {
            title: "The downside is not priced.",
            body: "Test what could break the case.",
            tone: "warning",
        },
        desktop: { x: -0.55, y: -0.8, z: 0.15, width: 3.2 },
        mobile: { x: 0, y: 0.25, z: 0.2, width: 4.4 },
    },
    {
        id: "value-source",
        moment: 1,
        kind: "source",
        height: 0.95,
        data: {
            title: "Dated fact sheet",
            body: "31 July 2020",
            tone: "success",
        },
        desktop: { x: -3.2, y: -1.75, z: -0.2, width: 2.9 },
        mobile: { x: 0, y: -1.0, z: 0.1, width: 4.4 },
    },
    {
        id: "value-outcome",
        moment: 1,
        kind: "outcome",
        height: 0.9,
        data: {
            title: "A research checklist",
            tone: "accent",
        },
        desktop: { x: 1.75, y: -2.1, z: 0.25, width: 2.9 },
        mobile: { x: 0, y: -2.1, z: 0, width: 4.1 },
    },

    // 3. What to try: speaker, source, follow-up as one spatial sequence.
    {
        id: "try-speaker",
        moment: 2,
        kind: "speaker",
        height: 1.0,
        data: {
            participantId: "mira",
            title: "Mira",
            body: "Credit Analyst",
        },
        desktop: { x: 0.35, y: 1.45, z: 0.55, width: 2.5 },
        mobile: { x: 0, y: 1.9, z: 0.4, width: 4.4 },
    },
    {
        id: "try-source",
        moment: 2,
        kind: "source",
        height: 1.0,
        data: {
            title: "Shared fact sheet",
            body: "Read the dated terms.",
            tone: "success",
        },
        desktop: { x: 2.65, y: 0.8, z: 0.15, width: 2.7 },
        mobile: { x: 0, y: 0.65, z: 0.2, width: 4.4 },
    },
    {
        id: "try-followup",
        moment: 2,
        kind: "followup",
        height: 1.0,
        data: {
            title: "What would break the case?",
            body: "Keep the meeting moving.",
            tone: "accent",
        },
        desktop: { x: 4.15, y: -0.55, z: 0.05, width: 2.9 },
        mobile: { x: 0, y: -0.65, z: 0, width: 4.4 },
    },

    // 4. The example: dated facts stay distinct from three judgments.
    {
        id: "example-fact",
        moment: 3,
        kind: "fact",
        height: 1.75,
        data: {
            title: "HDFC bond review",
            rows: [
                { label: "Issuer", value: "HDFC Ltd" },
                { label: "Instrument", value: "2022 debenture" },
                { label: "As of", value: "31 July 2020" },
            ],
        },
        desktop: { x: 1.55, y: 0.2, z: 0.3, width: 4.0 },
        mobile: { x: 0, y: 1.5, z: 0.25, width: 4.6 },
    },
    {
        id: "example-mira",
        moment: 3,
        kind: "lens",
        height: 1.1,
        data: {
            participantId: "mira",
            title: "What supports the terms?",
            body: "Mira · Credit Analyst",
        },
        desktop: { x: -3.65, y: 0.55, z: 0.4, width: 2.7 },
        mobile: { x: 0, y: -0.6, z: 0.3, width: 4.4 },
    },
    {
        id: "example-arjun",
        moment: 3,
        kind: "lens",
        height: 1.1,
        data: {
            participantId: "arjun",
            title: "What would break the case?",
            body: "Arjun · Downside Reviewer",
        },
        desktop: { x: 3.8, y: -1.45, z: 0.15, width: 2.7 },
        mobile: { x: 0, y: -2.05, z: 0.15, width: 4.4 },
    },
    {
        id: "example-leena",
        moment: 3,
        kind: "lens",
        height: 1.1,
        data: {
            participantId: "leena",
            title: "Does the mandate allow it?",
            body: "Leena · Portfolio Analyst",
        },
        desktop: { x: -0.45, y: -2.3, z: 0.0, width: 2.7 },
        mobile: { x: 0, y: -3.5, z: 0, width: 4.4 },
    },
    {
        id: "example-qualifier",
        moment: 3,
        kind: "qualifier",
        height: 0.5,
        data: {
            title: "Historical example · Not investment advice.",
            tone: "muted",
        },
        desktop: { x: 3.1, y: -2.45, z: 0.1, width: 2.8 },
        mobile: { x: 0, y: -4.55, z: 0, width: 4.2 },
    },
] as const;

export const INTRO_MAX_PROGRESS = 3;

export function introMomentAt(progress: number): number {
    return Math.min(Math.max(Math.round(progress), 0), INTRO_MAX_PROGRESS);
}

export function introAnchorForViewport(
    anchor: IntroCopyAnchor | IntroCardNode,
    compact: boolean
): IntroAnchor {
    return compact ? anchor.mobile : anchor.desktop;
}

export function introCardById(id: string): IntroCardNode | undefined {
    return INTRO_CARD_NODES.find((node) => node.id === id);
}
