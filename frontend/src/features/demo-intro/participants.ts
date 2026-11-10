export interface IntroParticipant {
    id: string;
    name: string;
    role: string;
    color: string;
    markId: string;
}

export const INTRO_PARTICIPANTS: readonly IntroParticipant[] = [
    {
        id: "mira",
        name: "Mira",
        role: "Credit Analyst",
        color: "#6366f1",
        markId: "demo-intro-mira",
    },
    {
        id: "arjun",
        name: "Arjun",
        role: "Downside Reviewer",
        color: "#f59e0b",
        markId: "demo-intro-arjun",
    },
    {
        id: "leena",
        name: "Leena",
        role: "Portfolio Analyst",
        color: "#10b981",
        markId: "demo-intro-leena",
    },
] as const;

export function introParticipant(id: string | undefined): IntroParticipant | null {
    return INTRO_PARTICIPANTS.find((participant) => participant.id === id) ?? null;
}
