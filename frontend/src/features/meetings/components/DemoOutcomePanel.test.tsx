import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
    Consensus,
    Disagreement,
    MeetingWithParticipants,
} from "../api/decoders";
import { DemoOutcomePanel } from "./DemoOutcomePanel";

const meeting = {
    id: "meeting-1",
    name: "Recorded review",
    agenda: "Prepared review",
    user_id: null,
    status: "ended",
    total_cost: 0,
    created_at: "2020-07-31T09:00:00Z",
    messages: [],
    participants: [
        {
            id: "mira",
            meeting_id: "meeting-1",
            name: "Mira",
            role: "Credit Analyst",
            color: "#6366f1",
            system_prompt: "",
            created_at: "2020-07-31T09:00:00Z",
        },
        {
            id: "arjun",
            meeting_id: "meeting-1",
            name: "Arjun",
            role: "Downside Reviewer",
            color: "#f59e0b",
            system_prompt: "",
            created_at: "2020-07-31T09:00:00Z",
        },
        {
            id: "leena",
            meeting_id: "meeting-1",
            name: "Leena",
            role: "Portfolio Analyst",
            color: "#10b981",
            system_prompt: "",
            created_at: "2020-07-31T09:00:00Z",
        },
    ],
} as unknown as MeetingWithParticipants;

const disagreement = {
    id: "disagreement-1",
    topic: "Executable price",
    status: "open",
    reasoning: "The record has terms but no executable price.",
    target_name: "Mira",
    severity: 5,
    created_at: "2020-07-31T09:05:00Z",
} as Disagreement;

const consensus = {
    id: "consensus-1",
    topic: "A bounded research checklist",
    participants: ["Mira", "Arjun", "Leena"],
    strength: 5,
    created_at: "2020-07-31T09:06:00Z",
} as Consensus;

describe("DemoOutcomePanel", () => {
    it("reflects mandates, retained conflicts, alignment, and the checklist", () => {
        render(
            <DemoOutcomePanel
                meeting={meeting}
                disagreements={[disagreement]}
                consensus={[consensus]}
                summary="Outcome: a research checklist, not an investment approval."
                archived={false}
            />
        );

        expect(screen.getByText("Different mandates")).toBeInTheDocument();
        expect(screen.getAllByText("Mira").length).toBeGreaterThan(0);
        expect(screen.getByText("Credit Analyst")).toBeInTheDocument();
        expect(screen.getByText("1 retained")).toBeInTheDocument();
        expect(screen.getByText("Executable price")).toBeInTheDocument();
        expect(screen.getByText("A bounded research checklist")).toBeInTheDocument();
        expect(
            screen.getByText(/a research checklist, not an investment approval/)
        ).toBeInTheDocument();
        expect(screen.getByText(/Archiving is optional/)).toBeInTheDocument();
        expect(screen.queryByText(/Severity/)).toBeNull();
        expect(screen.queryByText(/Strength/)).toBeNull();
    });

    it("does not equate archive with completion", () => {
        render(
            <DemoOutcomePanel
                meeting={meeting}
                disagreements={[]}
                consensus={[]}
                summary={null}
                archived
            />
        );

        expect(screen.getByText(/This record is archived/)).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Open the meetings list" })
        ).toHaveAttribute("href", "/demo/meetings");
    });
});
