import fs from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MeetingWithParticipants } from "@/features/meetings/api/decoders";
import type { MeetingsRuntime } from "@/features/meetings/runtime/contract";
import { MeetingsRuntimeProvider } from "@/features/meetings/runtime/context";
import { RecordedSummaryPanel } from "@/features/meetings/runtime/recorded-summary-panel";

const meeting = {
    id: "meeting-1",
    name: "Recorded review",
    agenda: "Assess the issuer",
    status: "archived",
    total_cost: 0,
    created_at: "2026-01-15T10:00:00Z",
    participants: [],
    messages: [
        {
            id: "message-summary",
            sequence: 1,
            sender_type: "system",
            sender_id: "sabha",
            sender_name: "Sabha",
            content: "The board retained the **7.87%** coupon after review.",
            created_at: "2020-07-31T12:00:00Z",
        },
    ],
} as unknown as MeetingWithParticipants;

const runtime = {
    replay: {
        chapters: [
            {
                chapter_id: "chapter-summary",
                title: "Recorded summary",
                objective: "Read the saved summary",
                checkpoint: "checkpoint-archived",
                route: "meeting",
                tab: "summary",
                mode: "inspection",
                disclosure: "",
                summary_message_id: "message-summary",
                claim_ids: [],
                input_asset_ids: [],
            },
        ],
        asOf: "2020-07-31",
        packageVersion: "6",
    },
} as unknown as MeetingsRuntime;

describe("RecordedSummaryPanel", () => {
    it("shows the saved system summary as historical evidence", () => {
        render(
            <MeetingsRuntimeProvider runtime={runtime}>
                <RecordedSummaryPanel meeting={meeting} />
            </MeetingsRuntimeProvider>
        );

        expect(screen.getByText("Recorded summary")).toBeInTheDocument();
        expect(screen.getByText("Inspection only")).toBeInTheDocument();
        expect(screen.getByText("Recorded system summary")).toBeInTheDocument();
        expect(
            screen.getByText(/retained the/)
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Recorded scope: as of 2020-07-31/)
        ).toBeInTheDocument();
        expect(screen.queryByText("Generate summary")).not.toBeInTheDocument();
    });

    it("does not import live settings, generation, or usage hooks", () => {
        const source = fs.readFileSync(
            path.join(
                process.cwd(),
                "src/features/meetings/runtime/recorded-summary-panel.tsx"
            ),
            "utf8"
        );
        for (const forbidden of [
            "useSettingsStore",
            "useGenerateSummary",
            "getProviderApiKey",
            "useProvidersEnvironment",
        ]) {
            expect(source).not.toContain(forbidden);
        }
    });
});
